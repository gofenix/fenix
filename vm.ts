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
import {
    built_ins,
    FunctionSymbol,
    Symbol,
    SymbolDumper,
    VarSymbol,
} from './symbol'

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

        // this.add
    }

    visitBlock(bloc: Block): any {}

    visitVariableDecl(variableDecl: VariableDecl) {}

    visitReturnStatement(returnStatement: ReturnStatement): any {}

    visitFunctionCall(functionCall: FunctionCall): any {}

    visitIfStatement(ifStatement: IfStatement): any {}

    visitForStatement(forStmt: ForStatement): any {}

    private addOffsetToJumpOp(code: number[], offset: number = 0): number[] {}

    private getVariableValue(sym: VarSymbol | null): any {}

    private setVariableValue(sym: VarSymbol | null): any {}

    visitBinary(bi: Binary): any {}

    visitUnary(u: Unary): any {}

    visitVariable(v: Variable): any {}

    visitIntegerLiteral(integerLiteral: IntegerLiteral): any {}

    visitStringLiteral(stringLiteral: StringLiteral): any {}
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
export class BCModuleWriter {}

/**
 * 从字节码生成BCModule
 */
export class BCModuleReader {}
