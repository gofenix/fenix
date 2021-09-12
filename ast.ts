/////////////////////////////////////////////////////////////////
// Parser

/**
 * AST基类
 */
export abstract class AstNode {
    // 打印对象信息，prefix是前面填充的字符串，通常用于缩进显示
    public abstract dump(prefix: string): void

    // visitor模式中，用于接受visitor的访问
    public abstract accept(visitor: AstVisitor): any
}


/**
 * 声明
 * 所有声明都会对应一个符号
 */
export abstract class Decl {
    name: string

    constructor(name: string) {
        this.name = name
    }
}

/**
 * 函数声明节点
 */
export class FunctionDecl extends Decl {
    body: Block

    constructor(name: string, body: Block) {
        super(name)
        this.body = body
    }

    accept(visitor: AstVisitor): any {
        return visitor.visitFunctionDecl(this)
    }

    dump(prefix: string): void {
        console.log(`${prefix}FunctionDecl ${this.name}`)
        console.log(prefix + "\t")
    }

}

/**
 * 函数体
 */
export class Block extends AstNode {
    stmts: Statement[]

    constructor(stmts: Statement[]) {
        super()
        this.stmts = stmts
    }

    accept(visitor: AstVisitor): any {
        return visitor.visitBlock(this)
    }

    dump(prefix: string): void {
        console.log(`${prefix}Block`);
        this.stmts.forEach(x => x.dump(prefix + "\t"))
    }
}

/**
 * 程序节点，也是AST的根节点
 */
export class Prog extends Block {
    accept(visitor: AstVisitor): any {
        return visitor.visitProg(this)
    }

    dump(prefix: string): void {
        console.log(`${prefix}Prog`)
        this.stmts.forEach(x => x.dump(prefix + "\t"))
    }
}

/**
 * 变量声明节点
 */
export class VariableDecl extends Decl {
    varType: string // 变量类型
    init: Expression | null // 变量初始化所用的表达式
    constructor(name: string, varType: string, init: Expression | null) {
        super(name)
        this.varType = varType
        this.init = init
    }

    accept(visitor: AstVisitor): any {
        return visitor.visitVariableDecl(this)
    }

    dump(prefix: string): void {
        console.log(`${prefix}VariableDecl ${this.name}, type: ${this.varType}`);
        if (this.init == null) {
            console.log(prefix + "no initialization");

        } else {
            this.init.dump(prefix + "\t")
        }
    }


}

/**
 * 语句
 * 其子类包括函数声明、表达式语句
 */
export abstract class Statement extends AstNode {

}

/**
 * 语句
 */
export abstract class Expression extends AstNode {
}

/**
 * 二元表达式
 */
export class Binary extends Expression {
    op: string
    exp1: Expression
    exp2: Expression

    constructor(op: string, exp1: Expression, exp2: Expression) {
        super()
        this.op = op
        this.exp1 = exp1
        this.exp2 = exp2
    }

    public dump(prefix: string): void {
        console.log(prefix + "Binary: " + this.op);
        this.exp1.dump(prefix + "\t")
        this.exp2.dump(prefix + "\t")

    }
    public accept(visitor: AstVisitor) {
        return visitor.visitBinary(this)
    }

}

/**
 * 表达式语句
 * 就是在表达式后面加个分号
 */
export class ExpressionStatement extends Statement {
    exp: Expression

    constructor(exp: Expression) {
        super()
        this.exp = exp
    }

    public dump(prefix: string): void {
        console.log(prefix + "ExpressionStatement");
        this.exp.dump(prefix + "\t")

    }
    public accept(visitor: AstVisitor) {
        return visitor.visitExpressionStatement(this)
    }
}

/**
 * 函数调用
 */
export class FunctionCall extends AstNode {
    name: string
    parameters: Expression[]
    decl: FunctionDecl | null = null  // 指向函数的声明

    constructor(name: string, parameters: Expression[]) {
        super()
        this.name = name
        this.parameters = parameters
    }

    public dump(prefix: string): void {
        console.log(`${prefix}FunctionCall: ${this.name} ${this.decl != null ? ', resolved' : ', not resolved'}`);

    }
    public accept(visitor: AstVisitor) {
        return visitor.visitFunctionCall(this)
    }
}


/**
 * 变量引用
 */
export class Variable extends Expression {
    name: string
    decl: VariableDecl | null = null

    constructor(name: string) {
        super()
        this.name = name
    }

    public dump(prefix: string): void {
        console.log(`${prefix}Variable: ${this.name} ${this.decl != null ? ', resolved' : ', not resolved'}`);
    }
    public accept(visitor: AstVisitor) {
        return visitor.visitVariable(this)
    }

}

/**
 * 字符串字面量
 */
export class StringLiteral extends Expression {
    value: string

    constructor(value: string) {
        super()
        this.value = value
    }

    public dump(prefix: string): void {
        console.log(prefix + this.value);
    }
    public accept(visitor: AstVisitor) {
        return visitor.visitStringLiteral(this)
    }

}

/**
 * 整型字面量
 */
export class IntegerLiteral extends Expression {
    value: string

    constructor(value: string) {
        super()
        this.value = value
    }

    public dump(prefix: string): void {
        console.log(prefix + this.value);

    }
    public accept(visitor: AstVisitor) {
        return visitor.visitIntegerLiteral(this)
    }

}

/**
 * 实数字面量
 */
export class DecimalLiteral extends Expression {
    value: number
    constructor(value: number) {
        super()
        this.value = value
    }

    public dump(prefix: string): void {
        console.log(prefix + this.value);

    }
    public accept(visitor: AstVisitor) {
        return visitor.visitDecimalLiteral(this)
    }

}

/**
 * null 字面量
 */
export class NullLiteral extends Expression {
    value: null = null

    constructor() {
        super()
    }

    public dump(prefix: string): void {
        console.log(prefix + this.value);
    }
    public accept(visitor: AstVisitor) {
        return visitor.visitNullLiteral(this)
    }
}

/**
 * Boolean字面量
 */
export class BooleanLiteral extends Expression {
    value: boolean
    constructor(value: boolean) {
        super()
        this.value = value
    }

    accept(visitor: AstVisitor): any {
        return visitor.visitBooleanLiteral(this)
    }

    dump(prefix: string): void {
        console.log(prefix + this.value);
    }
}


//////////////////////////////////////////////////////////////////
// Visitor
export abstract class AstVisitor {
    visit(node: AstNode): any {
        return node.accept(this)
    }

    visitProg(prog: Prog): any {
        let retVal: any
        for (let x of prog.stmts) {
            retVal = this.visit(x)
        }
        return retVal
    }

    visitVariableDecl(variableDecl: VariableDecl): any {
        if (variableDecl.init != null) {
            return this.visit(variableDecl.init)
        }
    }

    visitFunctionDecl(functionDecl: FunctionDecl): any {
        return this.visitBlock(functionDecl.body)
    }

    visitBlock(block: Block): any {
        let retVal: any
        for (let x of block.stmts) {
            retVal = this.visit(x)
        }
        return retVal
    }

    visitExpressionStatement(stmt: ExpressionStatement): any {
        return this.visit(stmt.exp)
    }

    visitBinary(exp: Binary): any {
        this.visit(exp.exp1)
        this.visit(exp.exp2)
    }

    visitIntegerLiteral(exp: IntegerLiteral): any {
        return exp.value
    }

    visitDecimalLiteral(exp: DecimalLiteral): any {
        return exp.value
    }

    visitStringLiteral(exp: StringLiteral): any {
        return exp.value
    }

    visitNullLiteral(exp: NullLiteral): any {
        return exp.value
    }

    visitBooleanLiteral(exp: BooleanLiteral): any {
        return exp.value
    }

    visitVariable(variable: Variable): any {
        return undefined
    }

    visitFunctionCall(functionCall: FunctionCall): any {
        return undefined
    }
}