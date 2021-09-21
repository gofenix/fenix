/**
 * 语义分析功能
 *
 * 当前特性：
 * 1. 树状的符号表
 *
 */

import {
    AstVisitor,
    AstNode,
    Block,
    Prog,
    Decl,
    VariableDecl,
    FunctionDecl,
    FunctionCall,
    Statement,
    Expression,
    ExpressionStatement,
    Binary,
    IntegerLiteral,
    DecimalLiteral,
    StringLiteral,
    Variable,
    ForStatement,
    Unary,
} from './ast'
import { CompileError } from './error'
import { Op, Operators } from './scanner'
import { Scope } from './scope'
import { built_ins, FunctionSymbol, SymKind, VarSymbol } from './symbol'
import { FunctionType, SysTypes, Type } from './types'

export class SemanticAnalyer {
    passes: SemanticAstVisitor[] = [
        new Enter(),
        new RefResolver(),
        new TypeChecker(),
        new TypeConverter(),
        new LeftValueAttributor(),
    ]

    errors: CompileError[] = []
    warnings: CompileError[] = []

    execute(prog: Prog): void {
        this.errors = []
        this.warnings = []
        for (let pass of this.passes) {
            pass.visitProg(prog)
            this.errors = this.errors.concat(pass.errors)
            this.warnings = this.warnings.concat(pass.warnings)
        }
    }
}

export class SemanticError extends CompileError {
    node: AstNode

    constructor(msg: string, node: AstNode, isWarning = false) {
        super(msg, node.beginPos, isWarning)
        this.node = node
    }
}

abstract class SemanticAstVisitor extends AstVisitor {
    errors: CompileError[] = []
    warnings: CompileError[] = []

    addError(msg: string, node: AstNode) {
        this.errors.push(new SemanticError(msg, node))
        console.log(`@${node.beginPos.toString()}: ${msg}`)
    }

    addWarnings(msg: string, node: AstNode) {
        this.errors.push(new SemanticError(msg, node, true))
        console.log(`@${node.beginPos.toString()}: ${msg}`)
    }
}

/////////////////////////////////////////////////////////////////////////
// 建立符号表
//

class Enter extends SemanticAstVisitor {
    scope: Scope | null = null
    functionSym: FunctionSymbol | null = null

    /**
     * 返回最顶级的scope对象
     */
    visitProg(prog: Prog): any {
        let sym = new FunctionSymbol(
            'main',
            new FunctionType(SysTypes.Integer, [])
        )
        prog.sym = sym
        this.functionSym = sym

        return super.visitProg(prog)
    }

    /**
     * 把函数声明加入符号表
     *
     * @param functionDecl
     */
    visitFunctionDecl(functionDecl: FunctionDecl): any {
        let currentScope = this.scope as Scope

        let paramTypes: Type[] = []
        if (functionDecl.callSignature.paramList != null) {
            for (let p of functionDecl.callSignature.paramList.params) {
                paramTypes.push(p.theType)
            }
        }

        let sym = new FunctionSymbol(
            functionDecl.name,
            new FunctionType(functionDecl.callSignature.theType, paramTypes)
        )
        sym.decl = functionDecl
        functionDecl.sym = sym

        if (currentScope.hasSymbol(functionDecl.name)) {
            this.addError(
                'Dumplicate symbol: ' + functionDecl.name,
                functionDecl
            )
        } else {
            currentScope.enter(functionDecl.name, sym)
        }

        let lastFunctionSym = this.functionSym
        this.functionSym = sym

        let oldScope = currentScope
        this.scope = new Scope(oldScope)
        functionDecl.scope = this.scope

        super.visitFunctionDecl(functionDecl)

        this.functionSym = lastFunctionSym

        this.scope = oldScope
    }

    /**
     * 遇到块儿的时候，就建立一级新的作用域
     * 支持块作用域
     *
     * @param block
     */
    visitBlock(block: Block): any {
        let oldScope = this.scope
        this.scope = new Scope(this.scope)
        block.scope = this.scope

        super.visitBlock(block)

        this.scope = oldScope
    }

    visitVariableDecl(variableDecl: VariableDecl): any {
        let currentScope = this.scope as Scope
        if (currentScope.hasSymbol(variableDecl.name)) {
            this.addError(
                'Dumplicate symbol: ' + variableDecl.name,
                variableDecl
            )
        }

        let sym = new VarSymbol(variableDecl.name, variableDecl.theType)
        variableDecl.sym = sym
        currentScope.enter(variableDecl.name, sym)

        this.functionSym?.vars.push(sym)
    }

    visitForStatement(forStmt: ForStatement): any {
        // 创建下一级的scope
        let oldScope = this.scope
        this.scope = new Scope(this.scope)
        forStmt.scope = this.scope

        super.visitForStatement(forStmt)

        this.scope = oldScope
    }
}

/////////////////////////////////////////////////////////////////////////////////
// 引用消解
class RefResolver extends SemanticAstVisitor {
    scope: Scope | null = null // 当前scope

    // 每个scope已经声明了变量的列表
    declaredVarsMap: Map<Scope, Map<string, VarSymbol>> = new Map()

    visitFunctionDecl(functionDecl: FunctionDecl): any {
        let oldScope = this.scope
        this.scope = functionDecl.scope as Scope
        console.assert(this.scope != null, 'scope不可为null')

        this.declaredVarsMap.set(this.scope, new Map())

        super.visitFunctionDecl(functionDecl)

        this.scope = oldScope
    }

    visitBlock(block: Block): any {
        let oldScope = this.scope
        this.scope = block.scope as Scope
        console.assert(this.scope != null, 'scope不可为null')

        this.declaredVarsMap.set(this.scope, new Map())

        super.visitBlock(block)

        this.scope = oldScope
    }

    visitForStatement(forStmt: ForStatement): any {
        let oldScope = this.scope
        this.scope = forStmt.scope as Scope
        console.assert(this.scope != null, 'scope不可为null')

        this.declaredVarsMap.set(this.scope, new Map())

        super.visitForStatement(forStmt)

        this.scope = oldScope
    }

    visitFunctionCall(functionCall: FunctionCall): any {
        let currentScope = this.scope as Scope

        if (built_ins.has(functionCall.name)) {
            functionCall.sym = built_ins.get(
                functionCall.name
            ) as FunctionSymbol
        } else {
            functionCall.sym = currentScope.getSymbolCascade(
                functionCall.name
            ) as FunctionSymbol | null
        }

        super.visitFunctionCall(functionCall)
    }

    visitVariableDecl(variableDecl: VariableDecl): any {
        let currentScope = this.scope as Scope
        let declaredSyms = this.declaredVarsMap.get(currentScope) as Map<
            string,
            VarSymbol
        >
        let sym = currentScope.getSymbol(variableDecl.name)
        if (sym != null) {
            declaredSyms.set(variableDecl.name, sym as VarSymbol)
        }

        super.visitVariableDecl(variableDecl)
    }

    visitVariable(variable: Variable): any {
        let currentScope = this.scope as Scope
        variable.sym = this.findVariableCascade(currentScope, variable)
    }

    private findVariableCascade(
        scope: Scope,
        variable: Variable
    ): VarSymbol | null {
        let declaredSyms = this.declaredVarsMap.get(scope) as Map<
            string,
            VarSymbol
        >
        let symInScope = scope.getSymbol(variable.name)

        if (symInScope != null) {
            if (declaredSyms.has(variable.name)) {
                return declaredSyms.get(variable.name) as VarSymbol
            } else {
                if (symInScope.kind == SymKind.Variable) {
                    this.addError(
                        "Variable: '" +
                            variable.name +
                            "' is used before declaration.",
                        variable
                    )
                } else {
                    this.addError(
                        "We expect a variable of name: '" +
                            variable.name +
                            "', but find a " +
                            SymKind[symInScope.kind] +
                            '.',
                        variable
                    )
                }
            }
        } else {
            if (scope.enclosingScope != null) {
                return this.findVariableCascade(scope.enclosingScope, variable)
            } else {
                this.addError(
                    "Cannot find a variable of name: '" + variable.name + "'",
                    variable
                )
            }
        }
        return null
    }
}

////////////////////////////////////////////////////////////////////////////////
// 属性分析
// 类型计算和检验

class LeftValueAttributor extends SemanticAstVisitor {
    parentOperator: Op | null = null

    visitBinary(binary: Binary): any {
        if (Operators.isAssignOp(binary.op) || binary.op == Op.Dot) {
            let lastParentOperator = this.parentOperator
            this.parentOperator = binary.op

            this.visit(binary.exp1)
            if (!binary.exp1.isLeftValue) {
                this.addError(
                    'Left child of operator ' +
                        Op[binary.op] +
                        ' need a left value',
                    binary.exp1
                )
            }

            this.parentOperator = lastParentOperator

            this.visit(binary.exp2)
        } else {
            super.visitBinary(binary)
        }
    }

    visitUnary(u: Unary): any {
        if (u.op == Op.Inc || u.op == Op.Dec) {
            let lastParentOperator = this.parentOperator

            this.parentOperator = u.op

            this.visit(u.exp)
            if (!u.exp.isLeftValue) {
                this.addError(
                    'Unary operator ' +
                        Op[u.op] +
                        'can only be applied to a left value',
                    u
                )
            }

            this.parentOperator = lastParentOperator
        } else {
            super.visitUnary(u)
        }
    }

    visitVariable(v: Variable): any {
        if (this.parentOperator != null) {
            let t = v.theType as Type

            if (!t.hasVoid()) {
                v.isLeftValue = true
            }
        }
    }

    visitFunctionCall(functionCall: FunctionCall): any {
        if (this.parentOperator == Op.Dot) {
            let functionType = functionCall.theType as FunctionType
            if (!functionType.returnType.hasVoid()) {
                functionCall.isLeftValue = true
            }
        }
    }
}

/**
 * 类型检查
 */
class TypeChecker extends SemanticAstVisitor {
    visitVariableDecl(variableDecl: VariableDecl): any {
        super.visitVariableDecl(variableDecl)

        if (variableDecl.init != null) {
            let t1 = variableDecl.theType as Type
            let t2 = variableDecl.init.theType as Type
            if (!t2.LE(t1)) {
                this.addError(
                    'Operator = can not be applied to ' +
                        t1.name +
                        ' and ' +
                        t2.name +
                        '.',
                    variableDecl
                )
            }

            // 类型推断： 对于any类型，变成=号右边的具体类型
            if (t1 === SysTypes.Any) {
                variableDecl.theType = t2
                ;(variableDecl.sym as VarSymbol).theType = t2
            }
        }
    }

    visitBinary(bi: Binary): any {
        super.visitBinary(bi)

        let t1 = bi.exp1.theType as Type
        let t2 = bi.exp2.theType as Type

        if (Operators.isAssignOp(bi.op)) {
            bi.theType = t1
            if (!t2.LE(t1)) {
                this.addError(
                    "Operator '" +
                        Op[bi.op] +
                        "' can not be applied to '" +
                        t1.name +
                        "' and '" +
                        t2.name +
                        "'.",
                    bi
                )
            }
        } else if (bi.op == Op.Plus) {
            if (t1 == SysTypes.String || t2 == SysTypes.String) {
                bi.theType = SysTypes.String
            } else if (t1.LE(SysTypes.Number) && t2.LE(SysTypes.Number)) {
                bi.theType = Type.getUpperBound(t1, t2)
            } else {
                this.addError(
                    "Operator '" +
                        Op[bi.op] +
                        "' can not be applied to '" +
                        t1.name +
                        "' and '" +
                        t2.name +
                        "'.",
                    bi
                )
            }
        } else if (Operators.isRelationOp(bi.op)) {
            if (t1.LE(SysTypes.Number) && t2.LE(SysTypes.Number)) {
                bi.theType = SysTypes.Boolean
            } else {
                this.addError(
                    "Operator '" +
                        Op[bi.op] +
                        "' can not be applied to '" +
                        t1.name +
                        "' and '" +
                        t2.name +
                        "'.",
                    bi
                )
            }
        } else if (Operators.isLogicalOp(bi.op)) {
            if (t1.LE(SysTypes.Boolean) && t2.LE(SysTypes.Boolean)) {
                bi.theType = SysTypes.Boolean
            } else {
                this.addError(
                    "Operator '" +
                        Op[bi.op] +
                        "' can not be applied to '" +
                        t1.name +
                        "' and '" +
                        t2.name +
                        "'.",
                    bi
                )
            }
        } else {
            this.addError('Unsupported binary operator: ' + Op[bi.op], bi)
        }
    }

    visitUnary(u: Unary): any {
        super.visitUnary(u)

        let t = u.exp.theType as Type
        // 要求必须是左值
        if (u.op == Op.Inc || u.op == Op.Dec) {
            if (t.LE(SysTypes.Number)) {
                u.theType = t
            } else {
                this.addError(
                    'Unary operator ' +
                        Op[u.op] +
                        "can not be applied to '" +
                        t.name +
                        "'.",
                    u
                )
            }
        } else if (u.op == Op.Minus || u.op == Op.Plus) {
            if (t.LE(SysTypes.Number)) {
                u.theType = t
            } else {
                this.addError(
                    'Unary operator ' +
                        Op[u.op] +
                        "can not be applied to '" +
                        t.name +
                        "'.",
                    u
                )
            }
        } else if (u.op == Op.Not) {
            if (t.LE(SysTypes.Boolean)) {
                u.theType = t
            } else {
                this.addError(
                    'Unary operator ' +
                        Op[u.op] +
                        "can not be applied to '" +
                        t.name +
                        "'.",
                    u
                )
            }
        } else {
            this.addError(
                'Unsupported unary operator: ' +
                    Op[u.op] +
                    " applied to '" +
                    t.name +
                    "'.",
                u
            )
        }
    }

    visitVariable(v: Variable): any {
        if (v.sym != null) {
            v.theType = v.sym.theType
        }
    }

    visitFunctionCall(functionCall: FunctionCall): any {
        if (functionCall.sym != null) {
            let functionType = functionCall.sym.theType as FunctionType

            functionCall.theType = functionType.returnType

            if (
                functionCall.arguments.length != functionType.paramTypes.length
            ) {
                this.addError(
                    'FunctionCall of ' +
                        functionCall.name +
                        ' has ' +
                        functionCall.arguments.length +
                        ' arguments, while expecting ' +
                        functionType.paramTypes.length +
                        '.',
                    functionCall
                )
            }

            for (let i = 0; i < functionCall.arguments.length; i++) {
                this.visit(functionCall.arguments[i])

                if (i < functionType.paramTypes.length) {
                    let t1 = functionCall.arguments[i].theType as Type
                    let t2 = functionType.paramTypes[i] as Type

                    if (!t1.LE(t2) && t2 !== SysTypes.String) {
                        this.addError(
                            'Argument ' +
                                i +
                                ' of FunctionCall ' +
                                functionCall.name +
                                'is of Type ' +
                                t1.name +
                                ', while expecting ' +
                                t2.name,
                            functionCall
                        )
                    }
                }
            }
        }
    }
}

/**
 * 类型转换
 */
class TypeConverter extends SemanticAstVisitor {
    visitBinary(bi: Binary): any {
        super.visitBinary(bi)

        let t1 = bi.exp1.theType as Type
        let t2 = bi.exp2.theType as Type

        if (Operators.isAssignOp(bi.op)) {
            if (t1 === SysTypes.String && t2 !== SysTypes.String) {
                if (t2 === SysTypes.Integer) {
                    let exp = new FunctionCall(
                        bi.exp2.beginPos,
                        bi.exp2.endPos,
                        'integer_to_string',
                        [bi.exp2]
                    )
                    exp.sym = built_ins.get(
                        'integer_to_string'
                    ) as FunctionSymbol
                    bi.exp2 = exp
                }
            }
        } else if (bi.op == Op.Plus) {
            //有一边是string，或者两边都是number才行。
            if (t1 === SysTypes.String || t2 === SysTypes.String) {
                if (t1 === SysTypes.Integer || t1 === SysTypes.Number) {
                    let exp = new FunctionCall(
                        bi.exp1.beginPos,
                        bi.exp1.endPos,
                        'integer_to_string',
                        [bi.exp1]
                    )
                    exp.sym = built_ins.get(
                        'integer_to_string'
                    ) as FunctionSymbol
                    bi.exp1 = exp
                }
                if (t2 === SysTypes.Integer || t2 === SysTypes.Number) {
                    let exp = new FunctionCall(
                        bi.exp2.beginPos,
                        bi.exp2.endPos,
                        'integer_to_string',
                        [bi.exp2]
                    )
                    exp.sym = built_ins.get(
                        'integer_to_string'
                    ) as FunctionSymbol
                    bi.exp2 = exp
                }
            }
        }
    }

    visitFunctionCall(functionCall: FunctionCall): any {
        if (functionCall.sym != null) {
            let functionType = functionCall.sym.theType as FunctionType

            //看看参数有没有可以转换的。
            for (let i = 0; i < functionCall.arguments.length; i++) {
                this.visit(functionCall.arguments[i])
                if (i < functionType.paramTypes.length) {
                    let t1 = functionCall.arguments[i].theType as Type
                    let t2 = functionType.paramTypes[i] as Type
                    if (
                        (t1 === SysTypes.Integer || t1 === SysTypes.Number) &&
                        t2 === SysTypes.String
                    ) {
                        let exp = new FunctionCall(
                            functionCall.arguments[i].beginPos,
                            functionCall.arguments[i].endPos,
                            'integer_to_string',
                            [functionCall.arguments[i]]
                        )
                        exp.sym = built_ins.get(
                            'integer_to_string'
                        ) as FunctionSymbol
                        functionCall.arguments[i] = exp
                    }
                }
            }
        }
    }
}

/**
 * 常量折叠
 */
class ConstFolder extends SemanticAstVisitor {
    visitBinary(bi: Binary): any {
        let v1 = bi.exp1.constValue
        let v2 = bi.exp2.constValue
        if (Operators.isAssignOp(bi.op)) {
            if (typeof v2 != 'undefined') {
                if (bi.op == Op.Assign) {
                    // 暂时只支持 = 号
                    bi.exp1.constValue = v1
                    bi.constValue = v1
                } else {
                    this.addError(
                        'Unsupported operator: ' + Op[bi.op] + 'in ConstFolder',
                        bi
                    )
                }
            }
        } else if (typeof v1 != 'undefined' && typeof v2 != 'undefined') {
            let v: any

            switch (bi.op) {
                case Op.Plus:
                    v = v1 + v2
                    break
                case Op.Minus:
                    v = v1 - v2
                    break
                case Op.Multiply:
                    v = v1 * v2
                    break
                case Op.Divide:
                    v = v1 / v2
                    break
                case Op.Modulus:
                    v = v1 % v2
                    break
                case Op.G:
                    v = v1 > v2
                    break
                case Op.GE:
                    v = v1 >= v2
                    break
                case Op.L:
                    v = v1 < v2
                    break
                case Op.LE:
                    v = v1 <= v2
                    break
                case Op.EQ:
                    v = v1 == v2
                    break
                case Op.NE:
                    v = v1 != v2
                    break
                case Op.And:
                    v = v1 && v2
                    break
                case Op.Or:
                    v = v1 || v2
                    break
                default:
                    this.addError(
                        'Unsupported binary operator: ' +
                            Op[bi.op] +
                            'in ConstFolder',
                        bi
                    )
            }
            bi.op = v
        }
    }

    visitUnary(u: Unary): any {
        let v1 = u.exp.constValue
        if (typeof v1 != 'undefined') {
            if (u.op == Op.Inc) {
                if (u.isPrefix) {
                    u.exp.constValue += 1
                    u.constValue = u.exp.constValue
                } else {
                    u.constValue = v1
                    u.exp.constValue += 1
                }
            } else if (u.op == Op.Dec) {
                if (u.isPrefix) {
                    u.exp.constValue -= 1
                    u.constValue = u.exp.constValue
                } else {
                    u.constValue = v1
                    u.exp.constValue -= 1
                }
            } else if (u.op == Op.Plus) {
                u.constValue = v1
            } else if (u.op == Op.Minus) {
                u.constValue = -v1
            } else if (u.op == Op.Not) {
                u.constValue = !v1
            } else {
                this.addError(
                    'Unsupported unary operator: ' +
                        Op[u.op] +
                        'in ConstFolder',
                    u
                )
            }
        }
    }
}
