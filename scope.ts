import { ForStatement } from 'typescript'
import { AstVisitor, Block, FunctionDecl } from './ast'
import { Symbol, SymbolDumper } from './symbol'

export class Scope {
    name2sym: Map<string, Symbol> = new Map()

    enclosingScope: Scope | null

    constructor(enclosingScope: Scope | null) {
        this.enclosingScope = enclosingScope
    }

    enter(name: string, sym: Symbol): void {
        this.name2sym.set(name, sym)
    }

    hasSymbol(name: string): boolean {
        return this.name2sym.has(name)
    }

    getSymbol(name: string): Symbol | null {
        let sym = this.name2sym.get(name)
        if (typeof sym == 'object') {
            return sym
        } else {
            return null
        }
    }

    getSymbolCascade(name: string): Symbol | null {
        let sym = this.getSymbol(name)
        if (sym != null) {
            return sym
        } else if (this.enclosingScope != null) {
            return this.enclosingScope.getSymbolCascade(name)
        } else {
            return null
        }
    }
}

export class ScopeDumper extends AstVisitor {
    visitFunctionDecl(functionDecl: FunctionDecl, prefix: any): any {
        console.log(`${prefix}Scope of function: ${functionDecl.name}`)

        if (functionDecl.scope != null) {
            this.dumpScope(functionDecl.scope, prefix)
        } else {
            console.log(prefix + '{null}')
        }
        super.visitFunctionDecl(functionDecl, prefix + '\t')
    }

    visitBlock(block: Block, prefix: any): any {
        console.log(prefix + 'Scope of block')
        if (block.scope != null) {
            this.dumpScope(block.scope, prefix)
        } else {
            console.log(prefix + '{null}')
        }
        super.visitBlock(block, prefix + '\ts')
    }

    visitForStatement(stmt) {
        // todo
    }

    private dumpScope(scope: Scope, prefix: string) {
        if (scope.name2sym.size > 0) {
            let symbolDumper = new SymbolDumper()
            for (let sym of scope.name2sym.values()) {
                symbolDumper.visit(sym, prefix + '\t')
            }
        } else {
            console.log(prefix + '\t{empty}')
        }
    }
}
