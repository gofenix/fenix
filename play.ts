
///////////////////////////////////////////////////////////////
// 解释器

import { Token, TokenKind, Scanner, CharStream } from './scanner';
import { AstVisitor, AstNode, Block, Prog, VariableDecl, FunctionDecl, FunctionCall, Statement, Expression, ExpressionStatement, Binary, IntegerLiteral, DecimalLiteral, StringLiteral, Variable } from './ast';
import { Parser } from './parser';
import { SymTable, SymKind, Enter, RefResolver } from './semantic';




/**
 * 遍历AST，并执行
 */
class Intepertor extends AstVisitor {
    values: Map<string, any> = new Map()

    // 函数声明不做任何事情
    visitFunctionDecl(functionDecl: FunctionDecl): any {

    }

    /**
     * 运行函数调用
     * 原理： 根据函数定义，执行其函数体
     * @param functionCall 
     */
    visitFunctionCall(functionCall: FunctionCall): any {
        if (functionCall.name == "println") {
            console.log("running function: " + functionCall.name);
            if (functionCall.parameters.length > 0) {
                let retVal = this.visit(functionCall.parameters[0])
                if (typeof (retVal as LeftValue).variable == 'object') {
                    retVal = this.getVariableValue((retVal as LeftValue).variable.name)
                }
                console.log(retVal);
            } else {
                console.log();

            }
            return 0
        } else {
            // 找到函数定义，继续遍历函数体
            if (functionCall.decl != null) {
                this.visitBlock(functionCall.decl.body)
            }
        }
    }

    private getVariableValue(varName: string): any {
        throw this.values.get(varName)
    }

    private setVariableValue(varName: string, value: any): any {
        return this.values.set(varName, value)
    }

    private isLeftValue(v: any): boolean {
        return typeof (v as LeftValue).variable == 'object'
    }

    /**
     * 变量声明
     * 如果存在变量初始化部分，要存下变量值
     * @param variableDecl 
     * @returns 
     */
    visitVariableDecl(variableDecl: VariableDecl): any {
        if (variableDecl.init != null) {
            let v = this.visit(variableDecl.init)
            if (this.isLeftValue(v)) {
                v = this.getVariableValue((v as LeftValue).variable.name)
            }
            this.setVariableValue(variableDecl.name, v)
            return v
        }
    }

    /**
     * 获取变量的值
     * 这里给出的是左值。左值既可以赋值（写），又可以获取当前值（读）
     * @param v 
     * @returns 
     */
    visitVariable(v: Variable): any {
        return new LeftValue(v)
    }

    visitBinary(bi: Binary): any {
        let ret: any
        let v1 = this.visit(bi.exp1)
        let v2 = this.visit(bi.exp2)
        let v1Left: LeftValue | null = null
        let v2Left: LeftValue | null = null

        if (this.isLeftValue(v1)) {
            v1Left = v1 as LeftValue
            v1 = this.getVariableValue(v1Left.variable.name)
            console.log("value of " + v1Left.variable.name + " : " + v1);
        }
        if (this.isLeftValue(v2)) {
            v2Left = v2 as LeftValue
            v2 = this.getVariableValue(v2Left.variable.name)
        }

        switch (bi.op) {
            case '+':
                ret = v1 + v2
                break
            case '-':
                ret = v1 - v2
                break
            case '*':
                ret = v1 * v2
                break
            case '/':
                ret = v1 / v2
                break
            case '%':
                ret = v1 % v2
                break
            case '>':
                ret = v1 > v2
                break
            case '>=':
                ret = v1 >= v2
                break
            case '<':
                ret = v1 < v2
                break
            case '<=':
                ret = v1 <= v2
                break
            case '&&':
                ret = v1 && v2
                break
            case '||':
                ret = v1 || v2
                break
            case '=':
                if (v1Left != null) {
                    this.setVariableValue(v1Left.variable.name, v2)
                } else {
                    console.log("Assignment need a left value: ");

                }
                break
            default:
                console.log("Unsupported binary operation: " + bi.op);

        }
        return ret
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


///////////////////////////////////////////////////主程序/////////////////////////////////////////////////////////////////////

function compileAndRun(program: string) {
    // 源码
    console.log("源码：")
    console.log(program)

    // 词法分析
    console.log("\n词法分析结果")
    let tokenizer = new Scanner(new CharStream(program))
    while (tokenizer.peek().kind != TokenKind.EOF) {
        console.log(tokenizer.next())
    }
    tokenizer = new Scanner(new CharStream(program)) // 重置，回到开头

    // 语法分析
    let prog = new Parser(tokenizer).parseProg()
    console.log("\n语法分析后的AST：")
    prog.dump("")

    // 语义分析
    let symTable = new SymTable()
    new Enter(symTable).visit(prog) // 建立符号表
    new RefResolver(symTable).visit(prog) // 引用消解
    console.log("\n语法分析之后的AST，注意自定义函数的调用已经被消解：")
    prog.dump("")

    // 运行程序
    console.log("\n运行当前的程序：")
    let retVal = new Intepertor().visit(prog)
    console.log("程序的返回值：" + retVal)
}


// 主程序
import * as process from 'process'
import * as fs from "fs"

function main() {
    // 要求命令行的第三个参数，一定是一个文件名
    // if (process.argv.length < 3) {
    //     console.log("Usage: node " + process.argv[1] + ' Filename')
    //     process.exit(1)
    // }
    //
    // // 读取源码
    // let filename = process.argv[2]
    let filename = "a.play"
    let data = fs.readFileSync(filename, 'utf8')
    compileAndRun(data)
}

main()