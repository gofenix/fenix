"use strict";
///////////////////////////////////词法分析////////////////////////////////////////////////////////////////////////
// token 类型
var TokenKind;
(function (TokenKind) {
    TokenKind[TokenKind["Keyword"] = 0] = "Keyword";
    TokenKind[TokenKind["Identifier"] = 1] = "Identifier";
    TokenKind[TokenKind["StringLiteral"] = 2] = "StringLiteral";
    TokenKind[TokenKind["Seperator"] = 3] = "Seperator";
    TokenKind[TokenKind["Operator"] = 4] = "Operator";
    TokenKind[TokenKind["EOF"] = 5] = "EOF";
})(TokenKind || (TokenKind = {}));
// 词法分析器
class Tokenizer {
    constructor(token) {
        this.pos = 0;
        this.token = token;
    }
    next() {
        if (this.pos <= this.token.length) {
            return this.token[this.pos++];
        }
        else {
            // 如果到了末尾，返回eof
            return this.token[this.pos];
        }
    }
    position() {
        return this.pos;
    }
    traceBack(newPos) {
        this.pos = newPos;
    }
}
///////////////////////////////语法分析////////////////////////////////////////////////////////////////////////////////
// 基类
class AstNode {
}
// 语句，
// 子类包含函数声明和函数调用
class Statement extends AstNode {
    static isStatementNode(node) {
        if (!node) {
            return false;
        }
        return true;
    }
}
// 程序节点，也是ast的根节点
class Prog extends AstNode {
    constructor(stmts) {
        super();
        this.stmts = stmts;
    }
    dump(prefix) {
        console.log(prefix + "Prog");
        this.stmts.forEach(x => x.dump(prefix + "\t"));
    }
}
// 函数声明节点
class FunctionDecl extends Statement {
    constructor(name, body) {
        super();
        this.name = name;
        this.body = body;
    }
    dump(prefix) {
        console.log(prefix + "FunctionDecl " + this.name);
        this.body.dump(prefix + "\t");
    }
}
// 函数体
class FunctionBody extends AstNode {
    constructor(stmts) {
        super();
        this.stmts = stmts;
    }
    static isFunctionBodyNode(node) {
        if (!node) {
            return false;
        }
        return true;
    }
    dump(prefix) {
        console.log(prefix + "FunctionBody");
        this.stmts.forEach(x => x.dump(prefix + "\t"));
    }
}
// 函数调用
class FunctionCall extends AstNode {
    constructor(name, parameters) {
        super();
        this.definition = null;
        this.name = name;
        this.parameters = parameters;
    }
    static isFunctionCallNode(node) {
        if (!node) {
            return false;
        }
        return true;
    }
    dump(prefix) {
        console.log(prefix + "FunctionCall " + this.name + (this.definition != null ? ", resolved" : ", not resolved"));
        this.parameters.forEach(x => console.log(prefix + "\t" + "Parameter: " + x));
    }
}
class Parser {
    constructor(tokenizer) {
        this.tokenizer = tokenizer;
    }
    // 解析prog
    // 语法规则
    // prog = (functionDecl | functionCall)* ;
    parseProg() {
        let stmts = [];
        let stmt = null;
        // 每次循环解析一个语句
        while (true) {
            // 尝试函数声明
            stmt = this.parseFunctionDecl();
            if (Statement.isStatementNode(stmt)) {
                stmts.push(stmt);
                continue;
            }
            // 上一个不成功，尝试函数调用
            stmt = this.parseFunctionCall();
            if (Statement.isStatementNode(stmt)) {
                stmts.push(stmt);
                continue;
            }
            // 如果都没有成功，那就结束
            if (stmt == null) {
                break;
            }
        }
        return new Prog(stmts);
    }
    // 解析函数声明
    // 语法规则 "function" Identifier "(" ")"  functionBody;
    parseFunctionDecl() {
        let oldPos = this.tokenizer.position();
        let t = this.tokenizer.next();
        if (t.kind == TokenKind.Keyword && t.text == "function") {
            t = this.tokenizer.next();
            if (t.kind == TokenKind.Identifier) {
                // 读取 ( )
                let t1 = this.tokenizer.next();
                if (t1.text == "(") {
                    let t2 = this.tokenizer.next();
                    if (t2.text == ")") {
                        let functionBody = this.parseFunctionBody();
                        if (FunctionBody.isFunctionBodyNode(functionBody)) {
                            return new FunctionDecl(t.text, functionBody);
                        }
                    }
                    else {
                        console.log("Expecting ')' in FunctionDecl, while we got a " + t.text);
                        return;
                    }
                }
            }
            else {
                console.log("Expecting '(' in FunctionDecl, while we got a " + t.text);
                return;
            }
        }
        // 如果解析不成功
        this.tokenizer.traceBack(oldPos);
        return null;
    }
    // 解析函数体
    // 语法规则 functionBody : '{' functionCall* '}' ;
    parseFunctionBody() {
        let oldPos = this.tokenizer.position();
        let stmts = [];
        let t = this.tokenizer.next();
        if (t.text == "{") {
            let functionCall = this.parseFunctionCall();
            while (FunctionCall.isFunctionCallNode(functionCall)) {
                stmts.push(functionCall);
                functionCall = this.parseFunctionCall();
            }
            t = this.tokenizer.next();
            if (t.text == "}") {
                return new FunctionBody(stmts);
            }
            else {
                console.log("Expecting '}' in FunctionBody, while we got a " + t.text);
                return;
            }
        }
        else {
            console.log("Expecting '{' in FunctionBody, while we got a " + t.text);
            return;
        }
        // 如果解析不成功，回溯，返回null
        this.tokenizer.traceBack(oldPos);
        return null;
    }
    // 解析函数调用
    // 语法规则：
    // functionCall : Identifier '(' parameterList? ')' ;
    // parameterList : StringLiteral (',' StringLiteral)* 
    parseFunctionCall() {
        let oldPos = this.tokenizer.position();
        let params = [];
        let t = this.tokenizer.next();
        if (t.kind == TokenKind.Identifier) {
            let t1 = this.tokenizer.next();
            if (t1.text == "(") {
                let t2 = this.tokenizer.next();
                // 循环，读出所有的
                while (t2.text != ")") {
                    if (t2.kind == TokenKind.StringLiteral) {
                        params.push(t2.text);
                    }
                    else {
                        console.log("Expecting parameter in FunctionCall, while we got a " + t2.text);
                        return;
                    }
                    t2 = this.tokenizer.next();
                    if (t2.text != ")") {
                        if (t2.text == ",") {
                            t2 = this.tokenizer.next();
                        }
                        else {
                            console.log("Expecting a comma in FunctionCall, while we got a " + t2.text);
                            return;
                        }
                    }
                }
                // 消化掉一个分号 ;
                t2 = this.tokenizer.next();
                if (t2.text == ";") {
                    return new FunctionCall(t.text, params);
                }
                else {
                    console.log("Expecting a comma in FunctionCall, while we got a " + t.text);
                    return;
                }
            }
        }
        // 如果解析不成功，回溯，返回null
        this.tokenizer.traceBack(oldPos);
        return null;
    }
}
// 对AST做遍历的Vistor
// 这个是一个基类，定义了缺省的遍历方式，子类可以覆盖默写方法，修改遍历的方式
class AstVisitor {
    visitProg(prog) {
        let retVal;
        for (let x of prog.stmts) {
            if (typeof x.body === 'object') {
                retVal = this.visitFunctionDecl(x);
            }
            else {
                retVal = this.visitFunctionCall(x);
            }
        }
        return retVal;
    }
    visitFunctionDecl(functionDecl) {
        return this.visitFunctionBody(functionDecl.body);
    }
    visitFunctionBody(functionBody) {
        let retVal;
        for (let x of functionBody.stmts) {
            retVal = this.visitFunctionCall(x);
        }
        return retVal;
    }
    visitFunctionCall(fuctionCall) {
        return undefined;
    }
}
//////////////////////////////////////////////////////////语义分析////////////////////////////////////////////////////////////
// 语义分析
// 对函数调用做引用消解，也就是找到函数的声明
// 遍历AST，如果发现函数调用，就去找它的定义
class RefResolver extends AstVisitor {
    constructor() {
        super(...arguments);
        this.prog = null;
    }
    visitProg(prog) {
        this.prog = prog;
        for (let x of prog.stmts) {
            let functionCall = x;
            if (typeof functionCall.parameters === 'object') {
                this.resolveFunctionCall(prog, functionCall);
            }
            else {
                this.visitFunctionDecl(x);
            }
        }
    }
    visitFunctionBody(functionBody) {
        if (this.prog != null) {
            for (let x of functionBody.stmts) {
                this.resolveFunctionCall(this.prog, x);
            }
        }
    }
    resolveFunctionCall(prog, functionCall) {
        let functionDecl = this.findFunctionDecl(prog, functionCall.name);
        if (functionDecl != null) {
            functionCall.definition = functionDecl;
        }
        else {
            // 系统内置函数不用报错
            if (functionCall.name != "println") {
                console.log("Error: cannot find definition of function " + functionCall.name);
            }
        }
    }
    findFunctionDecl(prog, name) {
        for (let x of prog === null || prog === void 0 ? void 0 : prog.stmts) {
            let functionDecl = x;
            if ((typeof functionDecl.body === 'object') && functionDecl.name == name) {
                return functionDecl;
            }
        }
        return null;
    }
}
//////////////////////////////////////////////////////解释器////////////////////////////////////////////////////////////////////
// 解释器
class Intepretor extends AstVisitor {
    visitProg(prog) {
        let retVal;
        for (let x of prog.stmts) {
            let functionCall = x;
            if (typeof functionCall.parameters === 'object') {
                retVal = this.runFunction(functionCall);
            }
        }
        return retVal;
    }
    visitFunctionBody(functionBody) {
        let retVal;
        for (let x of functionBody.stmts) {
            retVal = this.runFunction(x);
        }
    }
    runFunction(functionCall) {
        // 内置函数
        if (functionCall.name == "println") {
            if (functionCall.parameters.length > 0) {
                console.log(functionCall.parameters[0]);
            }
            else {
                console.log();
            }
            return 0;
        }
        else {
            if (functionCall.definition != null) {
                this.visitFunctionBody(functionCall.definition.body);
            }
        }
    }
}
///////////////////////////////////////////////////主程序/////////////////////////////////////////////////////////////////////
function compileAndRun(tokenArray) {
    // 词法分析
    let tokenizer = new Tokenizer(tokenArray);
    console.log("\n程序所使用的Token：");
    for (let token of tokenArray) {
        console.log(token);
    }
    // 语法分析
    let prog = new Parser(tokenizer).parseProg();
    console.log("\n语法分析之后的AST：");
    prog.dump("");
    // 语义分析
    new RefResolver().visitProg(prog);
    console.log("\n语义分析后的AST，注意自定义函数的调用已被消解：");
    prog.dump("");
    // 解释运行
    console.log("\n运行当前的程序:");
    let retVal = new Intepretor().visitProg(prog);
    console.log("程序返回值：" + retVal);
}
// 主程序
function main() {
    /**
    function sayHello(){
        println("Hello world");
    }
    sayHello();
    */
    // 从上面的文件中做完词法分析之后的结果
    let tokenArray = [
        { kind: TokenKind.Keyword, text: "function" },
        { kind: TokenKind.Identifier, text: "sayHello" },
        { kind: TokenKind.Seperator, text: "(" },
        { kind: TokenKind.Seperator, text: ")" },
        { kind: TokenKind.Seperator, text: "{" },
        { kind: TokenKind.Identifier, text: "println" },
        { kind: TokenKind.Seperator, text: "(" },
        { kind: TokenKind.StringLiteral, text: "Hello World!" },
        { kind: TokenKind.Seperator, text: ")" },
        { kind: TokenKind.Seperator, text: ";" },
        { kind: TokenKind.Seperator, text: "}" },
        { kind: TokenKind.Identifier, text: "sayHello" },
        { kind: TokenKind.Seperator, text: "(" },
        { kind: TokenKind.Seperator, text: ")" },
        { kind: TokenKind.Seperator, text: ";" },
        { kind: TokenKind.EOF, text: "" },
    ];
    compileAndRun(tokenArray);
    /**
    function sayHello(){
        println("Hello world");
    }
    sayHello();
    */
    // 从上面的文件中做完词法分析之后的结果
    let tokenArray2 = [
        { kind: TokenKind.Keyword, text: "function" },
        { kind: TokenKind.Identifier, text: "foo" },
        { kind: TokenKind.Seperator, text: "(" },
        { kind: TokenKind.Seperator, text: ")" },
        { kind: TokenKind.Seperator, text: "{" },
        { kind: TokenKind.Identifier, text: "println" },
        { kind: TokenKind.Seperator, text: "(" },
        { kind: TokenKind.StringLiteral, text: "in foo..." },
        { kind: TokenKind.Seperator, text: ")" },
        { kind: TokenKind.Seperator, text: ";" },
        { kind: TokenKind.Seperator, text: "}" },
        { kind: TokenKind.Keyword, text: "function" },
        { kind: TokenKind.Identifier, text: "bar" },
        { kind: TokenKind.Seperator, text: "(" },
        { kind: TokenKind.Seperator, text: ")" },
        { kind: TokenKind.Seperator, text: "{" },
        { kind: TokenKind.Identifier, text: "println" },
        { kind: TokenKind.Seperator, text: "(" },
        { kind: TokenKind.StringLiteral, text: "in bar..." },
        { kind: TokenKind.Seperator, text: ")" },
        { kind: TokenKind.Seperator, text: ";" },
        { kind: TokenKind.Seperator, text: "}" },
        { kind: TokenKind.Keyword, text: "function" },
        { kind: TokenKind.Identifier, text: "foobar" },
        { kind: TokenKind.Seperator, text: "(" },
        { kind: TokenKind.Seperator, text: ")" },
        { kind: TokenKind.Seperator, text: "{" },
        { kind: TokenKind.Identifier, text: "foo" },
        { kind: TokenKind.Seperator, text: "(" },
        { kind: TokenKind.Seperator, text: ")" },
        { kind: TokenKind.Seperator, text: ";" },
        { kind: TokenKind.Identifier, text: "bar" },
        { kind: TokenKind.Seperator, text: "(" },
        { kind: TokenKind.Seperator, text: ")" },
        { kind: TokenKind.Seperator, text: ";" },
        { kind: TokenKind.Identifier, text: "println" },
        { kind: TokenKind.Seperator, text: "(" },
        { kind: TokenKind.StringLiteral, text: "in foobar..." },
        { kind: TokenKind.Seperator, text: ")" },
        { kind: TokenKind.Seperator, text: ";" },
        { kind: TokenKind.Seperator, text: "}" },
        { kind: TokenKind.Identifier, text: "bar" },
        { kind: TokenKind.Seperator, text: "(" },
        { kind: TokenKind.Seperator, text: ")" },
        { kind: TokenKind.Seperator, text: ";" },
        { kind: TokenKind.Identifier, text: "foo" },
        { kind: TokenKind.Seperator, text: "(" },
        { kind: TokenKind.Seperator, text: ")" },
        { kind: TokenKind.Seperator, text: ";" },
        { kind: TokenKind.Identifier, text: "foobar" },
        { kind: TokenKind.Seperator, text: "(" },
        { kind: TokenKind.Seperator, text: ")" },
        { kind: TokenKind.Seperator, text: ";" },
        { kind: TokenKind.EOF, text: "" },
    ];
    compileAndRun(tokenArray2);
}
main();
