/**
 * 语法分析器
 *
 * 当前特性：
 * 1.简化版的函数声明
 * 2.简化版的函数调用
 * 3.简化版的表达式
 *
 * 当前语法规则：
 * prog = statementList? EOF;
 * statementList = (variableDecl | functionDecl | expressionStatement)+ ;
 * variableDecl : 'let' Identifier typeAnnotation？ ('=' singleExpression) ';';
 * typeAnnotation : ':' typeName;
 * functionDecl: "function" Identifier "(" ")"  functionBody;
 * functionBody : '{' statementList? '}' ;
 * statement: functionDecl | expressionStatement;
 * expressionStatement: expression ';' ;
 * expression: primary (binOP primary)* ;
 * primary: StringLiteral | DecimalLiteral | IntegerLiteral | functionCall | '(' expression ')' ;
 * binOP: '+' | '-' | '*' | '/' | '=' | '+=' | '-=' | '*=' | '/=' | '==' | '!=' | '<=' | '>=' | '<'
 *      | '>' | '&&'| '||'|...;
 * functionCall : Identifier '(' parameterList? ')' ;
 * parameterList : expression (',' expression)* ;
 */

import { type } from 'os'
import {
    Binary,
    Block,
    CallSignature,
    DecimalLiteral,
    ErrorExp,
    ErrorStmt,
    Expression,
    ExpressionStatement,
    ForStatement,
    FunctionCall,
    FunctionDecl,
    IfStatement,
    IntegerLiteral,
    ParameterList,
    Prog,
    ReturnStatement,
    Statement,
    StringLiteral,
    Unary,
    Variable,
    VariableDecl,
    VariableStatement,
} from './ast'
import { CompileError } from './error'
import {
    Scanner,
    TokenKind,
    Token,
    Position,
    Seperator,
    Keyword,
    Op,
} from './scanner'
import { SysTypes, Type } from './types'

export class Parser {
    scanner: Scanner

    constructor(scanner: Scanner) {
        this.scanner = scanner
    }

    errors: CompileError[] = []
    warnings: CompileError[] = []

    addError(msg: string, pos: Position) {
        this.errors.push(new CompileError(msg, pos, false))
        console.log(`@${pos.toString()}: ${msg}`)
    }

    addWarning(msg: string, pos: Position) {
        this.errors.push(new CompileError(msg, pos, false))
        console.log(`@${pos.toString()}: ${msg}`)
    }

    /**
     * 解析prog
     */
    parseProg(): Prog {
        let beginPos = this.scanner.peek().pos
        let stmts = this.parseStatementList()

        return new Prog(beginPos, this.scanner.getLastPos(), stmts)
    }

    parseStatementList(): Statement[] {
        let stmts: Statement[] = []
        let t = this.scanner.peek()

        // statementList的Follow集合里有EOF和}两个元素，分别用于prog和functionBody等场景
        while (t.kind != TokenKind.EOF && t.code != Seperator.CloseBrace) {
            let stmt = this.parseStatement()
            stmts.push(stmt)

            t = this.scanner.peek()
        }
        return stmts
    }

    /**
     * 解析语句
     * 知识点
     * 在这里，遇到函数调用、变量声明和变量赋值，都可能以Identifier开头的情况
     * 所以预读一个token是不够的。
     */
    parseStatement(): Statement {
        let t = this.scanner.peek()

        // 根据function关键字，去解析函数声明
        if (t.code == Keyword.Function) {
            return this.parseFunctionDecl()
        } else if (t.code == Keyword.Let) {
            return this.parseVariableStatement()
        } else if (t.code == Keyword.Return) {
            return this.parseReturnStatement()
        } else if (t.code == Keyword.If) {
            return this.parseIfStatement()
        } else if (t.code == Keyword.For) {
            return this.parseForStatement()
        } else if (t.code == Seperator.OpenBrace) {
            return this.parseBlock()
        } else if (
            t.kind == TokenKind.Identifier ||
            t.kind == TokenKind.DecimalLiteral ||
            t.kind == TokenKind.IntegerLiteral ||
            t.kind == TokenKind.StringLiteral ||
            t.code == Seperator.OpenParen
        ) {
            return this.parseExpressionStatement()
        } else {
            this.addError(
                'Can not recognize a statement starting with: ' +
                    this.scanner.peek().text,
                this.scanner.getLastPos()
            )
            let beginPos = this.scanner.getNextPos()
            this.skip()
            return new ErrorStmt(beginPos, this.scanner.getLastPos())
        }
    }

    /**
     * return 语句
     * 无论是否出错都会返回一个ReturnStatement
     */
    parseReturnStatement(): ReturnStatement {
        let beginPos = this.scanner.getNextPos()
        let exp: Expression | null = null

        // 跳过return
        this.scanner.next()

        // 解析后面的表达式
        let t = this.scanner.peek()
        if (t.code != Seperator.SemiColon) {
            exp = this.parseExpression()
        }

        // 跳过 ；
        t = this.scanner.peek()
        if (t.code == Seperator.SemiColon) {
            this.scanner.next()
        } else {
            this.addError(
                "Expecting ';' after return statement.",
                this.scanner.getLastPos()
            )
        }
        return new ReturnStatement(beginPos, this.scanner.getLastPos(), exp)
    }

    /**
     * 解析if语句
     */
    parseIfStatement(): IfStatement {
        let beginPos = this.scanner.getNextPos()

        // 跳过if
        this.scanner.next()
        let isErrorNode = false

        // 解析if条件
        let condition: Expression
        if (this.scanner.peek().code == Seperator.OpenParen) {
            // 跳过 (
            this.scanner.next()

            // 解析if条件
            condition = this.parseExpression()
            if (this.scanner.peek().code == Seperator.CloseParen) {
                // 跳过 )
                this.scanner.next()
            } else {
                this.addError(
                    "Expecting ')' after if condition.",
                    this.scanner.getLastPos()
                )
                this.skip()
                isErrorNode = true
            }
        } else {
            this.addError(
                "Expecting '(' after 'if'.",
                this.scanner.getLastPos()
            )
            this.skip()
            condition = new ErrorExp(beginPos, this.scanner.getLastPos())
        }

        // 解析then语句
        let stmt = this.parseStatement()

        // 解析else语句
        let elseStmt: Statement | null = null
        if (this.scanner.peek().code == Keyword.Else) {
            // 跳过else
            this.scanner.next()
            elseStmt = this.parseStatement()
        }

        return new IfStatement(
            beginPos,
            this.scanner.getLastPos(),
            condition,
            stmt,
            elseStmt,
            isErrorNode
        )
    }

    parseForStatement(): ForStatement {
        let beginPos = this.scanner.getNextPos()
        // 跳过for
        this.scanner.next()

        let isErrorNode = false
        let init: Expression | VariableDecl | null = null
        let terminate: Expression | null = null
        let increment: Expression | null = null

        if (this.scanner.peek().code == Seperator.OpenParen) {
            // 跳过 (
            this.scanner.next()

            // init
            if (this.scanner.peek().code != Seperator.SemiColon) {
                if (this.scanner.peek().code == Keyword.Let) {
                    // 跳过let
                    this.scanner.next()
                    init = this.parseVariableDecl()
                } else {
                    init = this.parseExpression()
                }
            }

            if (this.scanner.peek().code == Seperator.SemiColon) {
                this.scanner.next()
            } else {
                this.addError(
                    "Expecting ';' after init part of for statement.",
                    this.scanner.getLastPos()
                )
                this.skip()

                // 跳过后面的 ;
                if (this.scanner.peek().code == Seperator.SemiColon) {
                    this.scanner.peek()
                }
                isErrorNode = true
            }

            // terminate
            if (this.scanner.peek().code != Seperator.SemiColon) {
                terminate = this.parseExpression()
            }

            if (this.scanner.peek().code == Seperator.SemiColon) {
                this.scanner.next()
            } else {
                this.addError(
                    "Expecting ';' after terminate part of for statement.",
                    this.scanner.getLastPos()
                )
                this.skip()

                // 跳过后面的;
                if (this.scanner.peek().code == Seperator.SemiColon) {
                    this.scanner.next()
                }
                isErrorNode = true
            }

            // increment
            if (this.scanner.peek().code != Seperator.CloseParen) {
                increment = this.parseExpression()
            }

            if (this.scanner.peek().code == Seperator.CloseParen) {
                this.scanner.next()
            } else {
                this.addError(
                    "Expecting ')' after increment part of for statement.",
                    this.scanner.getLastPos()
                )
                this.skip()

                if (this.scanner.peek().code == Seperator.CloseParen) {
                    this.scanner.next()
                }
                isErrorNode = true
            }
        } else {
            this.addError(
                "Expecting '(' after 'for'.",
                this.scanner.getLastPos()
            )
            this.skip()
            isErrorNode = true
        }

        // stmt
        let stmt = this.parseStatement()

        return new ForStatement(
            beginPos,
            this.scanner.getLastPos(),
            init,
            terminate,
            increment,
            stmt,
            isErrorNode
        )
    }

    parseVariableStatement(): VariableStatement {
        let beginPos = this.scanner.getNextPos()
        let isErrorNode = false

        // 跳过let
        this.scanner.next()

        let variableDecl = this.parseVariableDecl()

        // 分号，结束变量声明
        let t = this.scanner.peek()
        if (t.code == Seperator.SemiColon) {
            // ;
            this.scanner.next()
        } else {
            this.skip()
            isErrorNode = true
        }

        return new VariableStatement(
            beginPos,
            this.scanner.getLastPos(),
            variableDecl,
            isErrorNode
        )
    }

    /**
     * 解析变量
     */
    parseVariableDecl(): VariableDecl {
        let beginPos = this.scanner.getNextPos()

        let t = this.scanner.next()
        if (t.kind == TokenKind.Identifier) {
            let varName: string = t.text
            let varType: string = 'any'
            let init: Expression | null = null
            let isErrorNode = false

            let t1 = this.scanner.peek()
            // 类型标注
            if (t1.code == Seperator.Colon) {
                this.scanner.next()

                t1 = this.scanner.peek()
                if (t1.kind == TokenKind.Identifier) {
                    this.scanner.next()
                    varType = t1.text
                } else {
                    this.addError(
                        'Error parsing type annotation in VariableDecl',
                        this.scanner.getLastPos()
                    )
                    this.skip(['='])
                    isErrorNode = true
                }
            }

            // 可选初始化部分
            t1 = this.scanner.peek()
            if (t1.code == Op.Assign) {
                this.scanner.next()
                init = this.parseExpression()
            }

            return new VariableDecl(
                beginPos,
                this.scanner.getLastPos(),
                varName,
                this.parseType(varType),
                init,
                isErrorNode
            )
        } else {
            this.addError(
                'Expecting variable name in VariableDecl, while we meet ' +
                    t.text,
                this.scanner.getLastPos()
            )
            this.skip()
            return new VariableDecl(
                beginPos,
                this.scanner.getLastPos(),
                'unknown',
                SysTypes.Any,
                null,
                true
            )
        }
    }

    private parseType(typeName: string): Type {
        switch (typeName) {
            case 'any':
                return SysTypes.Any
            case 'number':
                return SysTypes.Number
            case 'boolean':
                return SysTypes.Boolean
            case 'string':
                return SysTypes.String
            case 'undefined':
                return SysTypes.Undefined
            case 'null':
                return SysTypes.Null
            case 'void':
                return SysTypes.Void
            default:
                this.addError(
                    'Unrecognized type: ' + typeName,
                    this.scanner.getLastPos()
                )
                return SysTypes.Any
        }
    }

    /**
     * 解析函数声明
     */
    parseFunctionDecl(): FunctionDecl {
        let beginPos = this.scanner.getNextPos()
        let isErrorNode = false

        // 跳过关键字function
        this.scanner.next()

        let t = this.scanner.next()
        if (t.kind != TokenKind.Identifier) {
            this.addError(
                'Expecting a function name, while we got a ' + t.text,
                this.scanner.getLastPos()
            )

            this.skip()
            isErrorNode = true
        }

        // 解析callSignature
        let callSignature: CallSignature
        let t1 = this.scanner.peek()
        if (t1.code == Seperator.OpenParen) {
            // (
            callSignature = this.parseCallSignature()
        } else {
            this.addError(
                "Expecting '(' in FunctionDecl, while we got a " + t.text,
                this.scanner.getLastPos()
            )
            this.skip()
            callSignature = new CallSignature(
                beginPos,
                this.scanner.getLastPos(),
                null,
                SysTypes.Any,
                true
            )
        }

        // 解析block
        let functionBody: Block
        t1 = this.scanner.peek()
        if ((t1.code = Seperator.OpenBrace)) {
            // {
            functionBody = this.parseBlock()
        } else {
            this.addError(
                "Expecting '{' in FunctionDecl, while we got a " + t1.text,
                this.scanner.getLastPos()
            )
            this.skip()
            functionBody = new Block(
                beginPos,
                this.scanner.getLastPos(),
                [],
                true
            )
        }
        return new FunctionDecl(
            beginPos,
            t.text,
            callSignature,
            functionBody,
            isErrorNode
        )
    }

    /**
     * 解析函数前面
     */
    parseCallSignature(): CallSignature {
        let beginPos = this.scanner.getNextPos()

        // 跳过 （
        let t = this.scanner.next()

        let paramList = null
        if (this.scanner.peek().code != Seperator.CloseParen) {
            paramList = this.parseParameterList()
        }

        // 看看后面是不是 )
        t = this.scanner.peek()
        if (t.code == Seperator.CloseParen) {
            // 跳过 )
            this.scanner.next()

            // 解析typeAnnotation
            let theType: string = 'any'
            if (this.scanner.peek().code == Seperator.Colon) {
                // :
                theType = this.parseTypeAnnotation()
            }
            return new CallSignature(
                beginPos,
                this.scanner.getLastPos(),
                paramList,
                this.parseType(theType)
            )
        } else {
            this.addError(
                "Expecting a ')' after for a call signature",
                this.scanner.getLastPos()
            )
            return new CallSignature(
                beginPos,
                this.scanner.getLastPos(),
                paramList,
                SysTypes.Any,
                true
            )
        }
    }

    /**
     * 解析参数列表
     */
    parseParameterList(): ParameterList {
        let params: VariableDecl[] = []
        let beginPos = this.scanner.getNextPos()
        let isErrorNode = false
        let t = this.scanner.peek()
        while (t.code != Seperator.CloseParen && t.kind != TokenKind.EOF) {
            if (t.kind == TokenKind.Identifier) {
                this.scanner.next()
                let t1 = this.scanner.peek()
                let theType: string = 'any'
                if (t1.code == Seperator.Colon) {
                    theType = this.parseTypeAnnotation()
                }
                params.push(
                    new VariableDecl(
                        beginPos,
                        this.scanner.getLastPos(),
                        t.text,
                        this.parseType(theType),
                        null
                    )
                )

                // 处理 ,
                t = this.scanner.peek()
                if (t.code != Seperator.CloseParen) {
                    if (t.code == Op.Comma) {
                        this.scanner.next()
                        t = this.scanner.peek()
                    } else {
                        this.addError(
                            "Expecting a ',' or '）' after a parameter",
                            this.scanner.getLastPos()
                        )
                        this.skip()
                        isErrorNode = true

                        let t2 = this.scanner.peek()
                        if (t2.code == Op.Comma) {
                            this.scanner.next()
                            t = this.scanner.peek()
                        } else {
                            break
                        }
                    }
                }
            } else {
                this.addError(
                    'Expecting an identifier as name of a Parameter',
                    this.scanner.getLastPos()
                )
                this.skip()
                isErrorNode = true
                if (t.code == Op.Comma) {
                    this.scanner.next()
                    t = this.scanner.peek()
                } else {
                    break
                }
            }
        }
        return new ParameterList(
            beginPos,
            this.scanner.getLastPos(),
            params,
            isErrorNode
        )
    }

    /**
     * 解析类型注解
     * 无论是否出错，都返回一个类型，缺省就是 any
     */
    parseTypeAnnotation(): string {
        let theType = 'any'

        // 跳过 ：
        this.scanner.next()

        let t = this.scanner.peek()
        if (t.kind == TokenKind.Identifier) {
            this.scanner.next()
            theType = t.text
        } else {
            this.addError(
                'Expecting a type name in type annotation',
                this.scanner.getLastPos()
            )
        }
        return theType
    }

    parseBlock(): Block {
        let beginPos = this.scanner.getNextPos()
        let t: Token = this.scanner.peek()

        // 跳过{
        this.scanner.next()

        let stmts = this.parseStatementList()
        t = this.scanner.peek()
        if (t.code == Seperator.CloseBrace) {
            this.scanner.next()
            return new Block(beginPos, this.scanner.getLastPos(), stmts)
        } else {
            this.addError(
                "Expecting '}' while parsing a block, but we got a " + t.text,
                this.scanner.getLastPos()
            )
            this.skip()
            return new Block(beginPos, this.scanner.getLastPos(), stmts, true)
        }
    }

    /**
     * 解析表达式语句
     */
    parseExpressionStatement(): ExpressionStatement {
        let exp = this.parseExpression()
        let t = this.scanner.peek()
        let stmt = new ExpressionStatement(this.scanner.getLastPos(), exp)
        if (t.code == Seperator.SemiColon) {
            this.scanner.next()
        } else {
            this.addError(
                'Expecting a semicolon at the end of an expresson statement, while we got a ' +
                    t.text,
                this.scanner.getLastPos()
            )
            this.skip()
            stmt.endPos = this.scanner.getLastPos()
            stmt.isErrorNode = true
        }
        return stmt
    }

    /**
     * 解析表达式
     */
    parseExpression(): Expression {
        return this.parseAssignment()
    }

    private opPrec: Map<Op, number> = new Map([
        [Op.Assign, 2],
        [Op.PlusAssign, 2],
        [Op.MinusAssign, 2],
        [Op.MultiplyAssign, 2],
        [Op.DivideAssign, 2],
        [Op.ModulusAssign, 2],
        [Op.BitAndAssign, 2],
        [Op.BitOrAssign, 2],
        [Op.BitXorAssign, 2],
        [Op.LeftShiftArithmeticAssign, 2],
        [Op.RightShiftArithmeticAssign, 2],
        [Op.RightShiftLogicalAssign, 2],
        [Op.Or, 4],
        [Op.And, 5],
        [Op.BitOr, 6],
        [Op.BitXOr, 7],
        [Op.BitAnd, 8],
        [Op.EQ, 9],
        [Op.IdentityEquals, 9],
        [Op.NE, 9],
        [Op.IdentityNotEquals, 9],
        [Op.G, 10],
        [Op.GE, 10],
        [Op.L, 10],
        [Op.LE, 10],
        [Op.LeftShiftArithmetic, 11],
        [Op.RightShiftArithmetic, 11],
        [Op.RightShiftLogical, 11],
        [Op.Plus, 12],
        [Op.Minus, 12],
        [Op.Divide, 13],
        [Op.Multiply, 13],
        [Op.Modulus, 13],
    ])

    private getPrec(op: Op): number {
        let ret = this.opPrec.get(op)
        if (typeof ret == 'undefined') {
            return -1
        } else {
            return ret
        }
    }

    /**
     * 解析赋值表达式
     * 注意：赋值表达式是右结合的
     */
    parseAssignment(): Expression {
        let assignPrec = this.getPrec(Op.Assign)
        // 先解析一个优先级更高的表达式
        let exp1 = this.parseBinary(assignPrec)
        let t = this.scanner.peek()
        let tprec = this.getPrec(t.code as Op)

        // 存放赋值运算符两边的表达式
        let expStack: Expression[] = []
        expStack.push(exp1)

        // 存放赋值运算符
        let opStack: Op[] = []

        while (t.kind == TokenKind.Operator && tprec == assignPrec) {
            opStack.push(t.code as Op)
            this.scanner.next() // 跳过运算符
            // 获取运算符优先级高于assignment的二元表达式
            exp1 = this.parseBinary(assignPrec)
            expStack.push(exp1)
            t = this.scanner.peek()
            tprec = this.getPrec(t.code as Op)
        }

        // 组装成右结合的AST
        exp1 = expStack[expStack.length - 1]
        if (opStack.length > 0) {
            for (let i: number = expStack.length - 2; i >= 0; i--) {
                exp1 = new Binary(opStack[i], expStack[i], exp1)
            }
        }
        return exp1
    }

    /**
     * 采用运算符优先级算法，解析二元表达式
     * 这是一个递归的算法，一开始，提供的参数是最低的优先级
     */
    parseBinary(prec: number): Expression {
        // console.log("parseBinary: " + prec);
        let exp1 = this.parseUnary()
        let t = this.scanner.peek()
        let tprec = this.getPrec(t.code as Op)

        //下面这个循环的意思是：只要右边出现的新运算符的优先级更高，
        //那么就把右边出现的作为右子节点。
        /**
         * 对于2+3*5
         * 第一次循环，遇到+号，优先级大于零，所以做一次递归的parseBinary
         * 在递归的binary中，遇到乘号，优先级大于+号，所以形成3*5返回，又变成上一级的右子节点。
         *
         * 反过来，如果是3*5+2
         * 第一次循环还是一样，遇到*号，做一次递归的parseBinary
         * 在递归中，新的运算符的优先级要小，所以只返回一个5，跟前一个节点形成3*5,成为新的左子节点。
         * 接着做第二次循环，遇到+号，返回5，并作为右子节点，跟3*5一起组成一个新的binary返回。
         */
        while (t.kind == TokenKind.Operator && tprec > prec) {
            this.scanner.next()
            let exp2 = this.parseBinary(tprec)
            let exp: Binary = new Binary(t.code as Op, exp1, exp2)
            exp1 = exp2
            t = this.scanner.peek()
            tprec = this.getPrec(t.code as Op)
        }
        return exp1
    }

    /**
     * 解析一元表达式
     */
    parseUnary(): Expression {
        let beginPos = this.scanner.getNextPos()
        let t = this.scanner.peek()

        // 前缀的一元表达式
        if (t.kind == TokenKind.Operator) {
            this.scanner.next()
            let exp = this.parseUnary()
            return new Unary(
                beginPos,
                this.scanner.getLastPos(),
                t.code as Op,
                exp,
                true
            )
        } else {
            // 解析一个primary
            let exp = this.parsePrimary()
            let t1 = this.scanner.peek()
            if (
                t1.kind == TokenKind.Operator &&
                (t1.code == Op.Inc || t1.code == Op.Dec)
            ) {
                this.scanner.next()
                return new Unary(
                    beginPos,
                    this.scanner.getLastPos(),
                    t1.code as Op,
                    exp,
                    false
                )
            } else {
                return exp
            }
        }
    }

    /**
     * 解析基础表达式
     */
    parsePrimary(): Expression {
        let beginPos = this.scanner.getNextPos()

        let t = this.scanner.peek()

        // 以Identifier开头，可能是函数调用，也可能是一个变量，所以要再多向后看一个token
        // 这相当于在局部使用了LL2算法
        if (t.kind == TokenKind.Identifier) {
            if (this.scanner.peek2().code == Seperator.OpenParen) {
                return this.parseFunctionCall()
            } else {
                this.scanner.next()
                return new Variable(beginPos, this.scanner.getLastPos(), t.text)
            }
        } else if (t.kind == TokenKind.IntegerLiteral) {
            this.scanner.next()
            return new IntegerLiteral(beginPos, parseInt(t.text))
        } else if (t.kind == TokenKind.DecimalLiteral) {
            this.scanner.next()
            return new DecimalLiteral(beginPos, parseFloat(t.text))
        } else if (t.kind == TokenKind.StringLiteral) {
            this.scanner.next()
            return new StringLiteral(beginPos, t.text)
        } else if (t.code == Seperator.OpenParen) {
            this.scanner.next()
            let exp = this.parseExpression()
            let t1 = this.scanner.peek()
            if (t1.code == Seperator.CloseParen) {
                this.scanner.next()
            } else {
                this.addError(
                    "Expecting a ')' at the end of a primary expresson, while we got a " +
                        t.text,
                    this.scanner.getLastPos()
                )
            }
            return exp
        } else {
            // 理论上永远不会执行这里
            this.addError(
                'Can not recognize a primary expression starting with: ' +
                    t.text,
                this.scanner.getLastPos()
            )
            let exp = new ErrorExp(beginPos, this.scanner.getLastPos())
            return exp
        }
    }

    /**
     * 解析函数调用
     */
    parseFunctionCall(): FunctionCall {
        let beginPos = this.scanner.getNextPos()
        let params: Expression[] = []
        let name = this.scanner.next().text

        this.scanner.next()

        // 循环，读出所有参数
        let t1 = this.scanner.peek()
        while (t1.code != Seperator.CloseParen && t1.kind != TokenKind.EOF) {
            let exp = this.parseExpression()
            params.push(exp)

            if (exp?.isErrorNode) {
                this.addError(
                    'Error parsing parameter for function call ' + name,
                    this.scanner.getLastPos()
                )
            }

            t1 = this.scanner.peek()
            if (t1.code != Seperator.CloseParen) {
                if (t1.code == Op.Comma) {
                    t1 = this.scanner.next()
                } else {
                    this.addError(
                        'Expecting a comma at the end of a parameter, while we got a ' +
                            t1.text,
                        this.scanner.getLastPos()
                    )
                    this.skip()
                    return new FunctionCall(
                        beginPos,
                        this.scanner.getLastPos(),
                        name,
                        params,
                        true
                    )
                }
            }
        }
        if (t1.code == Seperator.CloseParen) {
            this.scanner.next()
        }

        return new FunctionCall(
            beginPos,
            this.scanner.getLastPos(),
            name,
            params
        )
    }

    private skip(seperators: string[] = []) {
        let t = this.scanner.peek()
        while (t.kind != TokenKind.EOF) {
            if (t.kind == TokenKind.Keyword) {
                return
            } else if (
                t.kind == TokenKind.Seperator &&
                (t.text == ',' ||
                    t.text == ';' ||
                    t.text == '{' ||
                    t.text == '}' ||
                    t.text == '(' ||
                    t.text == ')' ||
                    seperators.indexOf(t.text) != -1)
            ) {
                return
            } else {
                this.scanner.next()
                t = this.scanner.peek()
            }
        }
    }
}
