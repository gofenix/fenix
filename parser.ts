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

import {
    Binary,
    Block,
    DecimalLiteral,
    Expression,
    ExpressionStatement,
    FunctionCall,
    FunctionDecl,
    IntegerLiteral,
    Position,
    Prog,
    Statement,
    StringLiteral,
    Variable,
    VariableDecl,
} from './ast'
import { CompileError } from './error'
import { Scanner, TokenKind, Token } from './scanner'

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

        return new Prog(this.parseStatementList())
    }

    parseStatementList(): Statement[] {
        let stmts: Statement[] = []
        let t = this.scanner.peek()

        // statementList的Follow集合里有EOF和}两个元素，分别用于prog和functionBody等场景
        while (t.kind != TokenKind.EOF && t.text != '}') {
            let stmt = this.parseStatement()
            if (stmt != null) {
                stmts.push(stmt)
            } else {
                console.log('Error parsing a Statement in Program.')
                return []
            }
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
    parseStatement(): Statement | null {
        let t = this.scanner.peek()
        if (t.kind == TokenKind.Keyword && t.text == 'function') {
            return this.parseFunctionDecl()
        } else if (t.text == 'let') {
            return this.parseVariableDecl()
        } else if (
            t.kind == TokenKind.Identifier ||
            t.kind == TokenKind.DecimalLiteral ||
            t.kind == TokenKind.IntegerLiteral ||
            t.kind == TokenKind.StringLiteral ||
            t.text == '('
        ) {
            return this.parseExpressionStatement()
        } else {
            console.log(
                'Can not recognize a expression starting with: ' +
                    this.scanner.peek().text
            )
            return null
        }
    }

    /**
     * 解析变量
     */
    parseVariableDecl(): VariableDecl | null {
        // 跳过let
        this, this.scanner.next()

        let t = this.scanner.next()
        if (t.kind == TokenKind.Identifier) {
            let varName: string = t.text
            let varType: string = 'any'
            let init: Expression | null = null

            let t1 = this.scanner.peek()
            // 类型标注
            if (t1.text == ':') {
                this.scanner.next()
                t1 = this.scanner.peek()
                if (t1.kind == TokenKind.Identifier) {
                    this.scanner.next()
                    varType = t1.text
                    t1 = this.scanner.peek()
                } else {
                    console.log('Error parsing type annotation in VariableDecl')
                    return null
                }
            }

            // 初始化部分
            if (t1.text == '=') {
                this.scanner.next()
                init = this.parseExpression()
            }

            // 分号
            t1 = this.scanner.peek()
            if (t1.text == ';') {
                this.scanner.next()
                return new VariableDecl(varName, varType, init)
            } else {
                console.log(
                    'Expecting ; at the end of variable declaration, while we meet ' +
                        t1.text
                )
                return null
            }
        } else {
            console.log(
                'Expecting variable name in VariableDecl, while we meet ' +
                    t.text
            )
            return null
        }
    }

    /**
     * 解析函数声明
     */
    parseFunctionDecl(): FunctionDecl | null {
        // 跳过关键字function
        this.scanner.next()

        let t = this.scanner.next()
        if (t.kind == TokenKind.Identifier) {
            // 读取
            let t1 = this.scanner.next()
            if (t1.text == '(') {
                let t2 = this.scanner.next()
                if (t2.text == ')') {
                    let functionBody = this.parseFunctionBody()
                    if (functionBody != null) {
                        //如果解析成功，从这里返回
                        return new FunctionDecl(t.text, functionBody)
                    } else {
                        console.log(
                            'Error parsing FunctionBody in FunctionDecl'
                        )
                        return null
                    }
                } else {
                    console.log(
                        "Expecting '(' in FunctionDecl, while we got a " +
                            t.text
                    )
                    return null
                }
            } else {
                console.log(
                    "Expecting '(' in FunctionDecl, while we got a " + t.text
                )
                return null
            }
        } else {
            console.log('Expecting a function name, while we got a ' + t.text)
            return null
        }
        return null
    }

    /**
     * 解析函数体
     */
    parseFunctionBody(): Block | null {
        let t: Token = this.scanner.peek()
        if (t.text == '{') {
            this.scanner.next()
            let stmts = this.parseStatementList()
            t = this.scanner.next()
            if (t.text == '}') {
                return new Block(stmts)
            } else {
                console.log(
                    "Expecting '}' in FunctionBody, while we got a " + t.text
                )
                return null
            }
        } else {
            console.log(
                "Expecting '{' in FunctionBody, while we got a " + t.text
            )
            return null
        }
    }

    /**
     * 解析表达式语句
     */
    parseExpressionStatement(): ExpressionStatement | null {
        let exp = this.parseExpression()
        if (exp != null) {
            let t = this.scanner.peek()
            if (t.text == ';') {
                this.scanner.next()
                return new ExpressionStatement(exp)
            } else {
                console.log(
                    'Expecting a semicolon at the end of an expression statement, while we got a ' +
                        t.text
                )
                return null
            }
        } else {
            console.log('Error parsing ExpressionStatement')
            return null
        }
        return null
    }

    /**
     * 解析表达式
     */
    parseExpression(): Expression | null {
        return this.parseBinary(0)
    }

    private opPrec = new Map([
        ['=', 2],
        ['+=', 2],
        ['-=', 2],
        ['*=', 2],
        ['-=', 2],
        ['%=', 2],
        ['&=', 2],
        ['|=', 2],
        ['^=', 2],
        ['~=', 2],
        ['<<=', 2],
        ['>>=', 2],
        ['>>>=', 2],
        ['||', 4],
        ['&&', 5],
        ['|', 6],
        ['^', 7],
        ['&', 8],
        ['==', 9],
        ['===', 9],
        ['!=', 9],
        ['!==', 9],
        ['>', 10],
        ['>=', 10],
        ['<', 10],
        ['<=', 10],
        ['<<', 11],
        ['>>', 11],
        ['>>>', 11],
        ['+', 12],
        ['-', 12],
        ['*', 13],
        ['/', 13],
        ['%', 13],
    ])

    private getPrec(op: string): number {
        let ret = this.opPrec.get(op)
        if (typeof ret == 'undefined') {
            return -1
        } else {
            return ret
        }
    }

    /**
     * 采用运算符优先级算法，解析二元表达式
     * 这是一个递归的算法，一开始，提供的参数是最低的优先级
     */
    parseBinary(prec: number): Expression | null {
        // console.log("parseBinary: " + prec);
        let exp1 = this.parsePrimary()
        if (exp1 != null) {
            let t = this.scanner.peek()
            let tprec = this.getPrec(t.text)

            // 下面这个循环的意思是：只要右边出现的新运算符优先级更高，那么就把右边出现的作为右节点
            /**
             * 对于 2+3+5
             */
            while (t.kind == TokenKind.Operator && tprec > prec) {
                this.scanner.next() // 跳过运算符
                let exp2 = this.parseBinary(tprec)
                if (exp2 != null) {
                    let exp: Binary = new Binary(t.text, exp1, exp2)
                    exp1 = exp
                    t = this.scanner.peek()
                    tprec = this.getPrec(t.text)
                } else {
                    console.log(
                        'Can not recognize a expression starting with: ' +
                            t.text
                    )
                    return null
                }
            }
            return exp1
        } else {
            console.log(
                'Can not recognize a expression starting with: ' +
                    this.scanner.peek().text
            )
            return null
        }
        return null
    }

    /**
     * 解析基础表达式
     */
    parsePrimary(): Expression | null {
        let t = this.scanner.peek()
        console.log('parsePrimary: ' + t.text)

        // 以Identifier开头，可能是函数调用，也可能是一个变量，所以要再多向后看一个token
        // 这相当于在局部使用了LL2算法
        if (t.kind == TokenKind.Identifier) {
            if (this.scanner.peek2().text == '(') {
                return this.parseFunctionCall()
            } else {
                this.scanner.next()
                return new Variable(t.text)
            }
        } else if (t.kind == TokenKind.IntegerLiteral) {
            this.scanner.next()
            return new IntegerLiteral(parseInt(t.text))
        } else if (t.kind == TokenKind.DecimalLiteral) {
            this.scanner.next()
            return new DecimalLiteral(parseFloat(t.text))
        } else if (t.kind == TokenKind.StringLiteral) {
            this.scanner.next()
            return new StringLiteral(t.text)
        } else if (t.text == '(') {
            this.scanner.next()
            let exp = this.parseExpression()
            let t1 = this.scanner.peek()
            if (t1.text == ')') {
                this.scanner.next()
                return exp
            } else {
                console.log(
                    "Expecting a ')' at the end of primary expression, while we got a " +
                        t.text
                )
                return null
            }
        } else {
            console.log(
                'Can not recognize a primary expression starting with: ' +
                    t.text
            )
            return null
        }
    }

    /**
     * 解析函数调用
     */
    parseFunctionCall(): FunctionCall | null {
        let params: Expression[] = []
        let t: Token = this.scanner.next()
        if (t.kind == TokenKind.Identifier) {
            let t1: Token = this.scanner.next()

            if (t1.text == '(') {
                // 循环读出所有参数
                t1 = this.scanner.peek()
                while (t1.text != ')') {
                    let exp = this.parseExpression()
                    if (exp != null) {
                        params.push(exp)
                    } else {
                        console.log('Error parsing parameter in function call')
                        return null
                    }

                    t1 = this.scanner.peek()
                    if (t1.text != ')') {
                        if (t1.text == ',') {
                            t1 = this.scanner.next()
                        } else {
                            console.log(
                                'Expecting a comma at the end of a function call, while we got a ' +
                                    t.text
                            )
                            return null
                        }
                    }
                }

                // 消化掉')'
                this.scanner.next()

                return new FunctionCall(t.text, params)
            }
        }
        return null
    }
}
