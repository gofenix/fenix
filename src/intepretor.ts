import {
    AstVisitor,
    Binary,
    Block,
    Expression,
    ForStatement,
    FunctionCall,
    FunctionDecl,
    IfStatement,
    ReturnStatement,
    Unary,
    Variable,
    VariableDecl,
} from './ast'
import { Op } from './scanner'
import { VarSymbol, Symbol } from './symbol'

/////////////////////////////////////////////////////////////////////////
// 解释器

/**
 * 遍历AST，执行函数调用。
 */
export class Intepretor extends AstVisitor {
    //调用栈
    callStack: StackFrame[] = []

    //当前栈桢
    currentFrame: StackFrame

    private pushFrame(frame: StackFrame) {
        this.callStack.push(frame)
        this.currentFrame = frame
    }

    private popFrame() {
        if (this.callStack.length > 1) {
            let frame = this.callStack[this.callStack.length - 2]
            this.callStack.pop()
            this.currentFrame = frame
        }
    }

    constructor() {
        super()
        //创建顶层的栈桢
        this.currentFrame = new StackFrame()
        this.callStack.push(this.currentFrame)
    }

    //函数声明不做任何事情。
    visitFunctionDecl(functionDecl: FunctionDecl): any {}

    /**
     * 遍历一个块
     * @param block
     */
    visitBlock(block: Block): any {
        let retVal: any
        for (let x of block.stmts) {
            retVal = this.visit(x)
            //如果当前执行了一个返回语句，那么就直接返回，不再执行后面的语句。
            //如果存在上一级Block，也是中断执行，直接返回。

            if (
                typeof retVal == 'object' &&
                ReturnValue.isReturnValue(retVal)
            ) {
                return retVal
            }
        }
        return retVal
    }

    /**
     * 处理Return语句时，要把返回值封装成一个特殊的对象，用于中断后续程序的执行。
     * @param returnStatement
     */
    visitReturnStatement(returnStatement: ReturnStatement): any {
        let retVal: any
        if (returnStatement.exp != null) {
            retVal = this.visit(returnStatement.exp)
            this.setReturnValue(retVal)
        }
        return new ReturnValue(retVal) //这里是传递一个信号，让Block和for循环等停止执行。
    }

    //把返回值设置到上一级栈桢中（也就是调用者的栈桢）
    private setReturnValue(retVal: any) {
        let frame = this.callStack[this.callStack.length - 2]
        frame.retVal = retVal
    }

    /**
     * 执行if语句
     * @param ifStmt
     */
    visitIfStatement(ifStmt: IfStatement): any {
        //计算条件
        let conditionValue = this.visit(ifStmt.condition)
        //条件为真，则执行then部分
        if (conditionValue) {
            return this.visit(ifStmt.stmt)
        }
        //条件为false，则执行else部分
        else if (ifStmt.elseStmt != null) {
            return this.visit(ifStmt.elseStmt)
        }
    }

    /**
     * 执行for语句
     * @param forStmt
     */
    visitForStatement(forStmt: ForStatement): any {
        //执行init
        if (forStmt.init != null) {
            this.visit(forStmt.init)
        }

        //计算循环结束的条件
        let notTerminate =
            forStmt.condition == null ? true : this.visit(forStmt.condition)
        while (notTerminate) {
            //执行循环体
            let retVal = this.visit(forStmt.stmt)
            //处理循环体中的Return语句
            if (
                typeof retVal == 'object' &&
                ReturnValue.isReturnValue(retVal)
            ) {
                // console.log("is ReturnValue!!")
                return retVal
            }

            //执行增量表达式
            if (forStmt.increment != null) {
                this.visit(forStmt.increment)
            }

            //执行循环判断
            notTerminate =
                forStmt.condition == null ? true : this.visit(forStmt.condition)
        }
    }

    /**
     * 运行函数调用。
     * 原理：根据函数定义，执行其函数体。
     * @param functionCall
     */
    visitFunctionCall(functionCall: FunctionCall): any {
        // console.log("running funciton:" + functionCall.name);
        if (functionCall.name == 'println') {
            //内置函数
            return this.println(functionCall.arguments)
        } else if (functionCall.name == 'tick') {
            return this.tick()
        } else if (functionCall.name == 'integer_to_string') {
            return this.integer_to_string(functionCall.arguments)
        }

        if (functionCall.sym != null) {
            //清空返回值
            this.currentFrame.retVal = undefined

            //1.创建新栈桢
            let frame = new StackFrame()
            //2.计算参数值，并保存到新创建的栈桢
            let functionDecl = functionCall.sym.decl as FunctionDecl
            if (functionDecl.callSignature.paramList != null) {
                let params = functionDecl.callSignature.paramList.params
                for (let i = 0; i < params.length; i++) {
                    let variableDecl = params[i]
                    let val = this.visit(functionCall.arguments[i])
                    frame.values.set(variableDecl.sym as Symbol, val) //设置到新的frame里。
                }
            }

            //3.把新栈桢入栈
            this.pushFrame(frame)

            //4.执行函数
            this.visit(functionDecl.body)

            //5.弹出当前的栈桢
            this.popFrame()

            //5.函数的返回值
            return this.currentFrame.retVal
        } else {
            console.log(
                'Runtime error, cannot find declaration of ' +
                    functionCall.name +
                    '.'
            )
            return
        }
    }

    /**
     * 内置函数println
     * @param functionCall
     */
    private println(args: Expression[]): any {
        if (args.length > 0) {
            let retVal = this.visit(args[0])
            console.log(retVal)
        } else {
            console.log()
        }
        return 0
    }

    /**
     * 内置函数tick
     */
    private tick(): number {
        let date = new Date()
        let value = Date.UTC(
            date.getFullYear(),
            date.getMonth(),
            date.getDate(),
            date.getHours(),
            date.getMinutes(),
            date.getSeconds(),
            date.getMilliseconds()
        )
        return value
    }

    /**
     * 把整型转成字符串
     * @param functionCall
     */
    private integer_to_string(args: Expression[]): string {
        if (args.length > 0) {
            let arg = this.visit(args[0])
            return arg.toString()
        }
        return ''
    }

    /**
     * 变量声明
     * 如果存在变量初始化部分，要存下变量值。
     * @param functionDecl
     */
    visitVariableDecl(variableDecl: VariableDecl): any {
        if (variableDecl.init != null) {
            let v = this.visit(variableDecl.init)
            this.setVariableValue(variableDecl.sym as VarSymbol, v)
            return v
        }
    }

    /**
     * 获取变量的值。
     * 左值的情况，返回符号。否则，返回值。
     * @param v
     */
    visitVariable(v: Variable): any {
        if (v.isLeftValue) {
            return v.sym
        } else {
            return this.getVariableValue(v.sym as VarSymbol)
        }
    }

    private getVariableValue(sym: VarSymbol): any {
        return this.currentFrame.values.get(sym)
    }

    private setVariableValue(sym: VarSymbol, value: any): any {
        return this.currentFrame.values.set(sym, value)
    }

    visitBinary(bi: Binary): any {
        // console.log("visitBinary:" + bi.op);
        let ret: any
        let v1 = this.visit(bi.exp1)
        let v2 = this.visit(bi.exp2)
        switch (bi.op) {
            case Op.Plus: //'+'
                ret = v1 + v2
                break
            case Op.Minus: //'-'
                ret = v1 - v2
                break
            case Op.Multiply: //'*'
                ret = v1 * v2
                break
            case Op.Divide: //'/'
                ret = v1 / v2
                break
            case Op.Modulus: //'%'
                ret = v1 % v2
                break
            case Op.G: //'>'
                ret = v1 > v2
                break
            case Op.GE: //'>='
                ret = v1 >= v2
                break
            case Op.L: //'<'
                ret = v1 < v2
                break
            case Op.LE: //'<='
                ret = v1 <= v2
                break
            case Op.EQ: //'=='
                ret = v1 == v2
                break
            case Op.NE: //'!='
                ret = v1 != v2
                break
            case Op.And: //'&&'
                ret = v1 && v2
                break
            case Op.Or: //'||'
                ret = v1 || v2
                break
            case Op.Assign: //'='
                let varSymbol = v1 as VarSymbol
                this.setVariableValue(varSymbol, v2)

                break
            default:
                console.log('Unsupported binary operation: ' + Op[bi.op])
        }
        return ret
    }

    /**
     * 计算一元表达式
     * @param u
     */
    visitUnary(u: Unary): any {
        let v = this.visit(u.exp)
        let varSymbol: VarSymbol
        let value: any

        switch (u.op) {
            case Op.Inc: //'++'
                varSymbol = v as VarSymbol
                value = this.getVariableValue(varSymbol)
                this.setVariableValue(varSymbol, value + 1)
                if (u.isPrefix) {
                    return value + 1
                } else {
                    return value
                }

                break
            case Op.Dec: //'--'
                varSymbol = v as VarSymbol
                value = this.getVariableValue(varSymbol)
                this.setVariableValue(varSymbol, value - 1)
                if (u.isPrefix) {
                    return value - 1
                } else {
                    return value
                }
                break
            case Op.Plus: //'+'
                return v //不需要做任何动作
            case Op.Minus: //'-'
                return -v //对值取反
            default:
                console.log('Unsupported unary op: ' + Op[u.op])
        }
    }
}

// /**
//  * 左值。
//  * 目前先只是指变量。
//  */
// class LeftValue{
//     variable:VarSymbol;
//     constructor(variable:VarSymbol){
//         this.variable = variable;
//     }
// }

/**
 * 栈桢
 * 每个函数对应一级栈桢.
 */
class StackFrame {
    //存储变量的值
    values: Map<Symbol, any> = new Map()

    //返回值，当调用函数的时候，返回值放在这里
    retVal: any = undefined
}

/**
 * 用于封装Return语句的返回结果，并结束后续语句的执行。
 */
class ReturnValue {
    tag_ReturnValue: number = 0
    value: any
    constructor(value: any) {
        this.value = value
    }

    static isReturnValue(v: any) {
        return typeof (v as ReturnValue).tag_ReturnValue != 'undefined'
    }
}
