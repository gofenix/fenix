/**
 * 符号表和作用域
 */

import { FunctionDecl } from './ast'

import { FunctionType, SysTypes, Type } from './types'

export abstract class Symbol {
    name: string
    theType: Type = SysTypes.Any
    kind: SymKind

    constructor(name: string, theType: Type, kind: SymKind) {
        this.name = name
        this.theType = theType
        this.kind = kind
    }

    abstract accept(visitor: SymbolVisitor, additional: any): any
}

export class FunctionSymbol extends Symbol {
    vars: VarSymbol[] = [] // 本地变量的列表，参数也算是本地变量
    opStackSize: number = 10
    byteCode: number[] | null = null
    decl: FunctionDecl | null = null

    constructor(name: string, theType: FunctionType, vars: VarSymbol[] = []) {
        super(name, theType, SymKind.Function)
        this.theType = theType
        this.vars = vars
    }

    accept(visitor: SymbolVisitor, additional: any) {
        visitor.visitFunctionSymbol(this, additional)
    }

    getNumParams(): number {
        return (this.theType as FunctionType).paramTypes.length
    }
}

export class VarSymbol extends Symbol {
    constructor(name: string, theType: Type) {
        super(name, theType, SymKind.Variable)
        this.theType = theType
    }

    accept(visitor: SymbolVisitor, additional: any) {
        visitor.visitVarSymbol(this, additional)
    }
}

export enum SymKind {
    Variable,
    Function,
    Class,
    Interface,
    Parameter,
    Prog,
}

export abstract class SymbolVisitor {
    abstract visitVarSymbol(sym: VarSymbol, additional: any): any
    abstract visitFunctionSymbol(sym: FunctionSymbol, additional: any): any
}

export class SymbolDumper extends SymbolVisitor {
    visit(sym: Symbol, additional: any): any {
        return sym.accept(this, additional)
    }

    visitVarSymbol(sym: VarSymbol, additional: any): any {
        console.log(`${additional}${sym.name}{${SymKind[sym.kind]}}`)
    }

    visitFunctionSymbol(sym: FunctionSymbol, additional: any): any {
        console.log(additional + sym.name + '{' + SymKind[sym.kind] + ', local var count: ' + sym.vars.length + '}')
        if (sym.byteCode != null) {
            let str: string = ''
            for (let code of sym.byteCode) {
                str += code.toString(16) + ' '
            }
            console.log(additional + '\tbytecode: ' + str)
        }
    }
}
