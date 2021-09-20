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
import { VarSymbol } from './symbol'

export class Intepretor extends AstVisitor {
    callStack: StackFrame[] = []

    currentFrame: StackFrame

    constructor() {
        super()

        // 创建顶层栈帧
        this.currentFrame = new StackFrame()
        this.callStack.push(this.currentFrame)
    }

    private pushFrame(frame: StackFrame) {
        this.callStack.push(frame)
        this.currentFrame = frame
    }

    private popFrame(frame: StackFrame) {
        if (this.callStack.length > 1) {
            let frame = this.callStack[this.callStack.length - 2]
            this.callStack.pop()
            this.currentFrame = frame
        }
    }

    visitFunctionDecl(functionDecl: FunctionDecl): any {}

    /**
     * 遍历一个块儿
     * @param block
     */
    visitBlock(block: Block): any {
        let retVal: any
        for (let x of block.stmts) {
            retVal = this.visit(x)

            // 如果当前执行了一个返回值语句，那么直接返回，不再执行后面的语句
            // 如果存在上一级Block，也是中断执行，直接返回

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
     * 处理return语句时，要把返回值封装成一个特殊的对象，用于中断后续程序的执行
     * @param returnStatement
     */
    visitReturnStatement(returnStatement: ReturnStatement): any {
        let retVal: any
        if (returnStatement.exp != null) {
            retVal = this.visit(returnStatement.exp)
            this.setReturnValue(retVal)
        }
        return new ReturnValue(retVal) // 这里传递一个信号，让block和for循环停止执行
    }

    /**
     * 把返回值设置到上一级栈帧中，也就是调用者的栈帧
     * @param retVal
     */
    private setReturnValue(retVal: any) {
        let frame = this.callStack[this.callStack.length - 1]
        frame.retVal = retVal
    }

    /**
     * 执行if语句
     * @param ifStmt
     */
    visitIfStatement(ifStmt: IfStatement): any {
        // 计算条件
        let conditionValue = this.visit(ifStmt.condition)

        // 条件为真，执行then部分
        if (conditionValue) {
            return this.visit(ifStmt.stmt)
        } else if (ifStmt.elseStmt != null) {
            // 条件为false，执行false部分
            return this.visit(ifStmt.elseStmt)
        }
    }

    visitForStatement(forStmt: ForStatement): any {}

    visitFunctionCall(functionCall: FunctionCall): any {}

    private println(args: Expression[]): any {}

    private tick(): number {}

    private integer_to_string(args: Expression[]): string {}

    visitVariableDecl(variableDecl: VariableDecl): any {}

    visitVariable(v: Variable): any {}

    private getVariableValue(sym: VarSymbol): any {}

    private setVariableValue(sym: VarSymbol, value: any): any {}

    /**
     * 计算二元表达式
     * @param bi
     */
    visitBinary(bi: Binary): any {}

    /**
     * 计算一元表达式
     * @param u
     */
    visitUnary(u: Unary): any {}
}

/**
 * 栈帧
 * 每个函数对应一级栈帧
 */
class StackFrame {
    values: Map<Symbol, any> = new Map()

    retVal: any = undefined
}

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

/**
 * 左值
 * 目前先只是变量
 */
class LeftValue {
    variable: Variable
    constructor(variable: Variable) {
        this.variable = variable
    }
}
