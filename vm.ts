import { formatWithOptions } from 'util'
import {
    AstVisitor,
    Binary,
    Block,
    ForStatement,
    FunctionCall,
    FunctionDecl,
    IfStatement,
    IntegerLiteral,
    Prog,
    ReturnStatement,
    StringLiteral,
    Unary,
    Variable,
    VariableDecl,
} from './ast'
import { Op } from './scanner'
import {
    built_ins,
    FunctionSymbol,
    Symbol,
    SymbolDumper,
    VarSymbol,
} from './symbol'
import { FunctionType, SimpleType, SysTypes, Type, UnionType } from './types'

enum OpCode {
    iconst_0 = 0x03,
    iconst_1 = 0x04,
    iconst_2 = 0x05,
    iconst_3 = 0x06,
    iconst_4 = 0x07,
    iconst_5 = 0x08,
    bipush = 0x10, // 8位整数入栈
    sipush = 0x11, // 16位整数入栈
    ldc = 0x12, // 从常量池加载，load const
    iload = 0x15, // 本地变量入栈
    iload_0 = 0x1a,
    iload_1 = 0x1b,
    iload_2 = 0x1c,
    iload_3 = 0x1d,
    istore = 0x36,
    istore_0 = 0x3b,
    istore_1 = 0x3c,
    istore_2 = 0x3d,
    istore_3 = 0x3e,
    iadd = 0x60,
    isub = 0x64,
    imul = 0x68,
    idiv = 0x6c,
    iinc = 0x84,
    lcmp = 0x94,
    ifeq = 0x99,
    ifne = 0x9a,
    iflt = 0x9b,
    ifge = 0x9c,
    ifgt = 0x9d,
    ifle = 0x9f,
    if_icmpeq = 0x9f,
    if_icmpne = 0xa0,
    if_icmplt = 0xa1,
    if_icmpge = 0xa2,
    if_icmpgt = 0xa3,
    if_icmple = 0xa4,
    goto = 0xa7,
    ireturn = 0xac,
    return = 0xb1,
    invokestatic = 0xb8, // 调用函数

    // 自行扩展
    sadd = 0x61, // 字符串连接
    sldc = 0x13, // 把字符串入栈，字符串放在常量区，用两个操作数记录下来
}

/**
 * 字节码模块
 * 里面包括一个模块的各种函数的定义、常量池等内容
 */
export class BCModule {
    consts: any[] = []

    _main: FunctionSymbol | null = null

    constructor() {
        for (let fun of built_ins.values()) {
            this.consts.push(fun)
        }
    }
}

/**
 * 打印调试信息
 */
export class BCModuleDumper {
    dump(bcModule: BCModule) {
        let symbolDumper = new SymbolDumper()
        for (let x of bcModule.consts) {
            if (typeof x == 'number') {
                console.log('Number: ' + x)
            } else if (typeof x == 'string') {
                console.log('String: ' + x)
            } else if (typeof (x as Symbol).kind == 'number') {
                symbolDumper.visit(x, '')
            } else {
                console.log('unknown const: ')
                console.log(x)
            }
        }
    }
}

/**
 * 字节码生成程序
 */
export class BCGenerator extends AstVisitor {
    // 编译之后生成的模型
    m: BCModule

    // 当前的函数，用于查询本地变量的下标
    functionSym: FunctionSymbol | null = null

    // 当前节点是否属于表达式的一部分，主要用于判断一元运算符应该如何生成指令
    // todo 以后可以挪到数据流分析中
    inExpression: boolean = false

    constructor() {
        super()
        this.m = new BCModule()
    }

    /**
     * 主函数
     * @param prog
     * @returns
     */
    visitProg(prog: Prog): any {
        this.functionSym = prog.sym
        if (this.functionSym != null) {
            this.m.consts.push(this.functionSym)
            this.m._main = this.functionSym
            this.functionSym.byteCode = this.visitBlock(prog) as number[]
        }
        return this.m
    }

    /**
     * 函数声明
     * @param functionDecl
     */
    visitFunctionDecl(functionDecl: FunctionDecl): any {
        // 设置当前的函数符号
        let lastFunctionSym = this.functionSym
        this.functionSym = functionDecl.sym

        // 添加到module
        this.m.consts.push(this.functionSym)

        // 为函数体生成代码
        let code1 = this.visit(functionDecl.callSignature)
        let code2 = this.visit(functionDecl.body)

        this.addOffsetToJumpOp(code2, code1.length)

        if (this.functionSym != null) {
            this.functionSym.byteCode = code1.concat(code2)
        }

        // 恢复当前函数
        this.functionSym = lastFunctionSym
    }

    visitBlock(block: Block): any {
        let ret: number[] = []
        for (let x of block.stmts) {
            this.inExpression = false // 每个语句开始的时候重置
            let code = this.visit(x)
            if (typeof code == 'object') {
                // 在visitFunctionDecl的时候，会返回undetifined
                this.addOffsetToJumpOp(code, ret.length)
                ret = ret.concat(code)
            }
        }
        return ret
    }

    /**
     * 如果变量声明的时候有初始化的部分，那么要产生变量赋值的操作
     * @param variableDecl
     */
    visitVariableDecl(variableDecl: VariableDecl) {
        let code: number[] = []
        if (variableDecl.init != null) {
            // 获取初始化部分的code
            let ret = this.visit(variableDecl.init) as number[]
            code = code.concat(ret)

            // 生成变量赋值的指令
            code = code.concat(this.setVariableValue(variableDecl.sym))
        }
        return code
    }

    /**
     * 处理return语句时，要把返回值封装成一个特殊的对象，用于中断后续程序的执行
     *
     * @param returnStatement
     */
    visitReturnStatement(returnStatement: ReturnStatement): any {
        let code: number[] = []

        // 1. 为return后面的表达式生成代码
        if (returnStatement.exp != null) {
            let code1 = this.visit(returnStatement.exp) as number[]
            code = code.concat(code1)
            // 生成return代码
            code.push(OpCode.ireturn)
            return code
        } else {
            // 2. 生成return代码，返回void
            code.push(OpCode.return)
            return code
        }
    }

    visitFunctionCall(functionCall: FunctionCall): any {
        let code: number[] = []

        // 1. 依次生成与参数计算有关的指令，也就是把参数压到计算栈里
        for (let param of functionCall.arguments) {
            let code1 = this.visit(param)
            code = code.concat(code1 as number[])
        }

        // 2. 生成invoke指令
        let index = this.m.consts.indexOf(functionCall.sym)
        console.assert(index != -1, '生成字节码时，在模块中查找函数失败')
        code.push(OpCode.invokestatic)
        code.push(index >> 8)
        code.push(index)

        return code
    }

    visitIfStatement(ifstmt: IfStatement): any {
        let code: number[] = []

        let code_condition: number[] = this.visit(ifstmt.condition)
        this.inExpression = false // 重置

        let code_ifBlock: number[] = this.visit(ifstmt.stmt)
        this.inExpression = false

        let code_elseBlock: number[] =
            ifstmt.elseStmt == null ? [] : this.visit(ifstmt.elseStmt)
        this.inExpression = false

        // if语句块的地址
        let offset_ifBlock: number = code_condition.length + 3
        // else 语句块的地址
        let offset_elseBlock: number =
            code_condition.length + code_ifBlock.length + 6
        // if语句后面跟着下一个语句地址
        let offset_nextStmt: number = offset_elseBlock + code_elseBlock.length

        this.addOffsetToJumpOp(code_ifBlock, offset_ifBlock)
        this.addOffsetToJumpOp(code_elseBlock, offset_elseBlock)

        // 条件
        code = code.concat(code_condition)

        // 跳转：去执行else语句块
        code.push(OpCode.ifeq)
        code.push(offset_elseBlock >> 0)
        code.push(offset_elseBlock)

        // 条件为true的时执行的语句
        code = code.concat(code_ifBlock)

        // 跳转：到整个if语句之后的语句
        code.push(OpCode.goto)
        code.push(offset_nextStmt >> 8)
        code.push(offset_nextStmt)

        // 条件为else时执行的语句
        code = code.concat(code_elseBlock)

        return code
    }

    /**
     * 为for循环生成字节码
     * @param forStmt
     */
    visitForStatement(forStmt: ForStatement): any {
        let code: number[] = []
        let code_init: number[] =
            forStmt.init == null ? [] : this.visit(forStmt.init)
        this.inExpression = false

        let code_condition: number[] =
            forStmt.condition == null ? [] : this.visit(forStmt.condition)
        this.inExpression = false

        let code_increment: number[] =
            forStmt.increment == null ? [] : this.visit(forStmt.increment)
        this.inExpression = false

        let code_stmt: number[] =
            forStmt.stmt == null ? [] : this.visit(forStmt.stmt)
        this.inExpression = false

        // 循环条件的起始位
        let offset_condition = code_init.length
        // 循环体的起始位置
        let offset_stmt =
            offset_condition +
            code_condition.length +
            (code_condition.length > 0 ? 3 : 0)
        // 递增部分的起始位置
        let offset_increment = offset_stmt + code_stmt.length
        // 循环结束位置
        let offset_nextStmt = offset_increment + code_increment.length + 3

        this.addOffsetToJumpOp(code_condition, offset_condition)
        this.addOffsetToJumpOp(code_increment, offset_increment)
        this.addOffsetToJumpOp(code_stmt, offset_stmt)

        // 初始化部分
        code = code.concat(code_init)

        // 循环条件
        if (code_condition.length > 0) {
            code = code.concat(code_condition)

            // 根据条件的值跳转
            code.push(OpCode.ifeq)
            code.push(offset_nextStmt >> 8)
            code.push(offset_nextStmt)
        }

        // 循环体
        code = code.concat(code_stmt)

        // 递增部分
        code = code.concat(code_increment)

        // 跳转回循环条件
        code.push(OpCode.goto)
        code.push(offset_condition >> 8)
        code.push(offset_condition)

        return code
    }

    private addOffsetToJumpOp(code: number[], offset: number = 0): number[] {
        if (offset == 0) {
            return code
        }

        let codeIndex = 0
        while (codeIndex < code.length) {
            switch (code[codeIndex]) {
                //纯指令，后面不带操作数
                case OpCode.iadd:
                case OpCode.sadd:
                case OpCode.isub:
                case OpCode.imul:
                case OpCode.idiv:
                case OpCode.iconst_0:
                case OpCode.iconst_1:
                case OpCode.iconst_2:
                case OpCode.iconst_3:
                case OpCode.iconst_4:
                case OpCode.iconst_5:
                case OpCode.istore_0:
                case OpCode.istore_1:
                case OpCode.istore_2:
                case OpCode.istore_3:
                case OpCode.iload_0:
                case OpCode.iload_1:
                case OpCode.iload_2:
                case OpCode.iload_3:
                case OpCode.ireturn:
                case OpCode.return:
                case OpCode.lcmp:
                    codeIndex++
                    continue

                // 指令后面带一个字节的操作数
                case OpCode.iload:
                case OpCode.istore:
                case OpCode.bipush:
                case OpCode.ldc:
                case OpCode.sldc:
                    codeIndex += 2
                    continue

                // 跳转语句，需要给指令后面加上offset
                case OpCode.if_icmpeq:
                case OpCode.if_icmpne:
                case OpCode.if_icmpge:
                case OpCode.if_icmpgt:
                case OpCode.if_icmple:
                case OpCode.if_icmplt:
                case OpCode.ifeq:
                case OpCode.ifne:
                case OpCode.ifge:
                case OpCode.ifgt:
                case OpCode.ifle:
                case OpCode.iflt:
                case OpCode.goto:
                    let byte1 = code[codeIndex + 1]
                    let byte2 = code[codeIndex + 2]
                    let address = (byte1 << 8) | (byte2 + offset)
                    code[codeIndex + 1] = address >> 8
                    code[codeIndex + 2] = address
                    codeIndex += 3
                    continue
                default:
                    console.log(
                        'unrecognized OpCode in addOffsetToJump: ' +
                            OpCode[code[codeIndex]]
                    )
                    return code
            }
        }
        return code
    }

    /**
     * 生成获取本地变量值的指令
     *
     * @param sym
     */
    private getVariableValue(sym: VarSymbol | null): any {
        let code: number[] = []
        if (sym != null) {
            // 本地变量的下标
            let index = this.functionSym?.vars.indexOf(sym)
            console.assert(
                index != -1,
                '生成字节码时（获取变量的值）， 在函数符号中获取本地变量下标失败！'
            )
            // 根据不同的下标生成指令，尽量生成压缩指令
            switch (index) {
                case 0:
                    code.push(OpCode.iload_0)
                    break
                case 1:
                    code.push(OpCode.iload_1)
                    break
                case 2:
                    code.push(OpCode.iload_2)
                    break
                case 3:
                    code.push(OpCode.iload_3)
                    break
                default:
                    code.push(OpCode.iload)
                    code.push(index as number)
            }
        }
        return code
    }

    private setVariableValue(sym: VarSymbol | null): any {
        let code: number[] = []
        if (sym != null) {
            let index = this.functionSym?.vars.indexOf(sym)
            console.assert(
                index != -1,
                '生成字节码时(设置变量值)，在函数符号中查找变量失败！'
            )

            switch (index) {
                case 0:
                    code.push(OpCode.istore_0)
                    break
                case 1:
                    code.push(OpCode.istore_1)
                    break
                case 2:
                    code.push(OpCode.istore_2)
                    break
                case 3:
                    code.push(OpCode.istore_3)
                    break
                default:
                    code.push(OpCode.istore)
                    code.push(index as number)
            }
        }
        return code
    }

    visitBinary(bi: Binary): any {
        this.inExpression = true

        let code: number[]
        let code1 = this.visit(bi.exp1)
        let code2 = this.visit(bi.exp2)

        let address1: number = 0
        let address2: number = 0
        let tempCode: number = 0

        // 1. 处理赋值
        if (bi.op == Op.Assign) {
            let varSymbol = code1 as VarSymbol
            console.log('varSymbol: ')
            console.log(varSymbol)

            // 加入右子树的代码
            code = code2
            // 加入istore代码
            code = code.concat(this.setVariableValue(varSymbol))
        } else {
            // 处理其他二元运算符
            // 加入左子树的代码
            code = code1
            // 加入右子树
            code = code.concat(code2)

            // 加入运算符代码
            switch (bi.op) {
                case Op.Plus:
                    if (bi.theType == SysTypes.String) {
                        code.push(OpCode.sadd)
                    } else {
                        code.push(OpCode.iadd)
                    }
                    break
                case Op.Minus:
                    code.push(OpCode.isub)
                    break
                case Op.Multiply:
                    code.push(OpCode.imul)
                    break
                case Op.Divide:
                    code.push(OpCode.idiv)
                    break
                case Op.G:
                case Op.GE:
                case Op.L:
                case Op.LE:
                case Op.EQ:
                case Op.NE:
                    if (bi.op == Op.G) {
                        tempCode = OpCode.if_icmple
                    } else if (bi.op == Op.GE) {
                        tempCode = OpCode.if_icmplt
                    } else if (bi.op == Op.L) {
                        tempCode = OpCode.if_icmpge
                    } else if (bi.op == Op.LE) {
                        tempCode = OpCode.if_icmpgt
                    } else if (bi.op == Op.EQ) {
                        tempCode = OpCode.if_icmpne
                    } else if (bi.op == Op.NE) {
                        tempCode = OpCode.if_icmpeq
                    }

                    address1 = code.length + 7
                    address2 = address2 + 1
                    code.push(tempCode)
                    code.push(address1 >> 8)
                    code.push(address1)
                    code.push(OpCode.iconst_1)
                    code.push(OpCode.goto)
                    code.push(address2 >> 8)
                    code.push(address2)
                    code.push(OpCode.iconst_0)
                    break
                default:
                    console.log('unsupported binary operation: ' + bi.op)
                    return []
            }
        }

        return code
    }

    visitUnary(u: Unary): any {
        let code: number[] = []
        let v = this.visit(u.exp)
        let varSymbol: VarSymbol
        let varIndex: number

        if (u.op == Op.Inc) {
            varSymbol = v as VarSymbol
            varIndex = this.functionSym?.vars.indexOf(varSymbol) as number
            if (u.isPrefix) {
                code.push(OpCode.iinc)
                code.push(varIndex)
                code.push(-1)
                if (this.inExpression) {
                    code = code.concat(this.getVariableValue(varSymbol))
                }
            } else {
                if (this.inExpression) {
                    code = code.concat(this.getVariableValue(varSymbol))
                }
                code.push(OpCode.iinc)
                code.push(varIndex)
                code.push(1)
            }
        } else if (u.op == Op.Dec) {
            varSymbol = v as VarSymbol
            varIndex = this.functionSym?.vars.indexOf(varSymbol) as number
            if (u.isPrefix) {
                code.push(OpCode.iinc)
                code.push(varIndex)
                code.push(-1)
                if (this.inExpression) {
                    code = code.concat(this.getVariableValue(varSymbol))
                }
            } else {
                if (this.inExpression) {
                    code = code.concat(this.getVariableValue(varSymbol))
                }
                code.push(OpCode.iinc)
                code.push(varIndex)
                code.push(-1)
            }
        } else {
            console.log('Unsupported unary operator: ' + u.op)
        }
        return code
    }

    visitVariable(v: Variable): any {
        if (v.isLeftValue) {
            return v.sym
        } else {
            return this.getVariableValue(v.sym)
        }
    }

    visitIntegerLiteral(integerLiteral: IntegerLiteral): any {
        let ret: number[] = []
        let value = integerLiteral.value

        // 0-5之间的数字，直接用快捷指令
        if (value >= 0 && value <= 5) {
            switch (value) {
                case 0:
                    ret.push(OpCode.iconst_0)
                    break
                case 1:
                    ret.push(OpCode.iconst_1)
                    break
                case 2:
                    ret.push(OpCode.iconst_2)
                    break
                case 3:
                    ret.push(OpCode.iconst_3)
                    break
                case 4:
                    ret.push(OpCode.iconst_4)
                    break
                case 5:
                    ret.push(OpCode.iconst_5)
                    break
            }
        } else if (value >= -128 && value < 128) {
            // 如果是8位整数，用bipush指令，直接放在后面的一个字节的操作数里就行了
            ret.push(OpCode.bipush)
            ret.push(value)
        } else if (value >= -32768 && value < 32768) {
            // 如果是16位整数，用sipush
            ret.push(OpCode.sipush)
            // 要拆成两个字节
            ret.push(value >> 8)
            ret.push(value & 0x00ff)
        } else {
            // 大于16位的，采用ldc指令，从常量池中去取
            ret.push(OpCode.ldc)
            // 把value值放入常量池
            this.m.consts.push(value)
            ret.push(this.m.consts.length - 1)
        }

        return ret
    }

    visitStringLiteral(stringLiteral: StringLiteral): any {
        let ret: number[] = []
        let value = stringLiteral.value
        this.m.consts.push(value)
        ret.push(OpCode.sldc)
        ret.push(this.m.consts.length - 1)
        return ret
    }
}

/**
 * 虚拟机
 */
export class VM {
    callStack: StackFrame[] = []

    constructor() {}

    /**
     * 运行一个模块
     *
     * @param bcModule
     */
    execute(bcModule: BCModule): number {
        // 找到入口函数
        let functionSym: FunctionSymbol
        if (bcModule._main == null) {
            console.log("can't find main function.")
            return -1
        } else {
            functionSym = bcModule._main
        }

        // 创建栈帧
        let frame = new StackFrame(functionSym)
        this.callStack.push(frame)

        //当前运行代码
        let code: number[] = []
        if (functionSym.byteCode != null) {
            code = functionSym.byteCode
        } else {
            console.log("can't find code for " + frame.functionSym.name)
            return -1
        }

        // 当前代码的位置
        let codeIndex = 0

        // 一直执行代码，直到遇到 return 语句
        let opCode = code[codeIndex]

        // 临时变量
        let byte1: number = 0
        let byte2: number = 0
        let vleft: any
        let vright: any
        let tempCodeIndex: number = 0
        let constIndex: number = 0
        let numValue: number = 0
        let strValue: string = ''

        while (true) {
            switch (opCode) {
                case OpCode.iconst_0:
                    frame.oprandStack.push(0)
                    opCode = code[++codeIndex]
                    continue
                case OpCode.iconst_1:
                    continue
            }
        }
    }
}

/**
 * 栈帧
 */
class StackFrame {
    // 对应的函数，用来找到代码
    functionSym: FunctionSymbol

    // 返回地址
    returnIndex: number = 0

    // 本地变量
    localVars: number[]

    // 操作数栈
    oprandStack: any[] = []

    constructor(functionSym: FunctionSymbol) {
        this.functionSym = functionSym
        this.localVars = new Array(functionSym.vars.length)
    }
}

/**
 * 从BCModule生成字节码
 */
export class BCModuleWriter {
    private types: Type[] = [] // 保存该模块所涉及的类型

    write(bcModule: BCModule): number[] {
        let bc2: number[] = []
        this.types = []

        // 写入常量
        let numConsts = 0
        for (let c of bcModule.consts) {
            if (typeof c == 'number') {
                bc2.push(1)
                bc2.push(c)
                numConsts++
            } else if (typeof c == 'string') {
                bc2.push(2)
                this.writeString(bc2, c)
                numConsts++
            } else if (typeof c == 'object') {
                let functionSym = c as FunctionSymbol
                if (!built_ins.has(functionSym.name)) {
                    bc2.push(3)
                    bc2 = bc2.concat(this.writeFunctionSymbol(functionSym))
                    numConsts++
                }
            } else {
                console.log('unsupported const in BCModuleWriter.')
                console.log(c)
            }
        }

        let bc1: number[] = []
        this.writeString(bc1, 'types')
        bc1.push(this.types.length)
        for (let t of this.types) {
            if (Type.isFunctionType(t)) {
                bc1 = bc1.concat(this.writeFunctionType(t as FunctionType))
            } else if (Type.isSimpleType(t)) {
                bc1 = bc1.concat(this.writeSimpleType(t as SimpleType))
            } else if (Type.isUnionType(t)) {
                bc1 = bc1.concat(this.writeUnionType(t as UnionType))
            } else {
                console.log('Unsupported type in BCModuleWriter')
                console.log(t)
            }
        }

        this.writeString(bc1, 'consts')
        bc1.push(numConsts)

        return bc1.concat(bc2)
    }

    private writeVarSymbol(sym: VarSymbol): number[] {
        let bc: number[] = []

        this.writeString(bc, sym.name)

        this.writeString(bc, sym.theType.name)

        if (
            !SysTypes.isSysType(sym.theType) &&
            this.types.indexOf(sym.theType) == -1
        ) {
            this.types.push(sym.theType)
        }

        return bc
    }

    writeFunctionSymbol(sym: FunctionSymbol): number[] {
        let bc: number[] = []

        this.writeString(bc, sym.name)

        this.writeString(bc, sym.theType.name)

        if (
            !SysTypes.isSysType(sym.theType) &&
            this.types.indexOf(sym.theType) == -1
        ) {
            this.types.push(sym.theType)
        }

        bc.push(sym.opStackSize)

        bc.push(sym.vars.length)

        for (let v of sym.vars) {
            bc = bc.concat(this.writeVarSymbol(v))
        }

        if (sym.byteCode == null) {
            bc.push(0)
        } else {
            bc.push((sym.byteCode as number[]).length)
            bc = bc.concat(sym.byteCode as number[])
        }

        return bc
    }

    writeSimpleType(t: SimpleType): number[] {
        let bc: number[] = []
        if (SysTypes.isSysType(t)) {
            return bc
        }

        bc.push(1)

        this.writeString(bc, t.name)

        bc.push(t.upperTypes.length)
        for (let ut of t.upperTypes) {
            this.writeString(bc, ut.name)
            if (!SysTypes.isSysType(ut) && this.types.indexOf(ut) == -1) {
                this.types.push(ut)
            }
        }

        return bc
    }

    writeFunctionType(t: FunctionType): number[] {
        let bc: number[] = []

        bc.push(2)

        this.writeString(bc, t.name)

        this.writeString(bc, t.returnType.name)

        bc.push(t.paramTypes.length)

        for (let pt of t.paramTypes) {
            this.writeString(bc, pt.name)
            if (this.types.indexOf(pt) == -1) {
                this.types.push(pt)
            }
        }

        return bc
    }

    writeUnionType(t: UnionType): number[] {
        let bc: number[] = []

        bc.push(3)

        for (let ut of t.types) {
            this.writeString(bc, t.name)
            if (this.types.indexOf(ut) == -1) {
                this.types.push(ut)
            }
        }

        return bc
    }

    private writeString(bc: number[], str: string) {
        bc.push(str.length)
        for (let i = 0; i < str.length; i++) {
            bc.push(str.charCodeAt(i))
        }
    }
}

/**
 * 从字节码生成BCModule
 */
export class BCModuleReader {
    // 读取字节码的下标
    private index: number = 0

    // 解析出来的所有类型
    private types: Map<string, Type> = new Map()
    private typeInfos: Map<string, any> = new Map()

    read(bc: number[]): BCModule {}

    private readString(bc: number[]): string {}

    private readSimpleType(bc: number[]) {}

    private readFunctionType(bc: number[]) {}

    private readUnionType(bc: number[]) {}

    private addSystemTypes() {}

    private buildTypes() {}

    private readFunctionSymbol(bc: number[]): FunctionSymbol {}

    private readVarSymbol(bc: number[]): VarSymbol {}
}
