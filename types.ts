/**
 * 类型体系
 */
export abstract class Type {
    name: string

    constructor(name: string) {
        this.name = name
    }

    abstract LE(type2: Type): boolean

    abstract accept(visitor: TypeVisitor): any

    abstract hasVoid(): boolean

    abstract toString(): string

    static getUpperBound(type1: Type, type2: Type): Type {}

    static isSimpleType(t: Type) {}

    static isUnionType(t: Type) {}

    static isFunctionType(t: Type) {}
}

export class SimpleType extends Type {
    upperTypes: Type[]
    constructor(name: string, upperTypes: SimpleType[] = []) {
        super(name)
        this.upperTypes = upperTypes
    }

    LE(type2: Type): boolean {
        throw new Error('Method not implemented.')
    }
    accept(visitor: TypeVisitor) {
        throw new Error('Method not implemented.')
    }
    hasVoid(): boolean {}
    toString(): string {
        throw new Error('Method not implemented.')
    }
}

export class FunctionType extends Type {
    returnType: Type
    paramypes: Type[]
    static index: number = 0

    constructor(
        returnType: Type = SysTypes.Void,
        paramTypes: Type[] = [],
        name: string | undefined = undefined
    ) {
        super('@function')
        this.returnType = returnType
        this.paramypes = paramTypes
        if (typeof name == 'string') {
            this.name = name
        } else {
            this.name = '@function' + FunctionType.index++
        }
    }

    LE(type2: Type): boolean {
        throw new Error('Method not implemented.')
    }
    accept(visitor: TypeVisitor) {
        throw new Error('Method not implemented.')
    }
    hasVoid(): boolean {
        throw new Error('Method not implemented.')
    }
    toString(): string {
        throw new Error('Method not implemented.')
    }
}

export class UnionType extends Type {
    types: Type[]
    static index: number = 0

    constructor(types: Type[], name: string | undefined = undefined) {
        super('@union')
        this.types = types

        if (typeof name == 'string') {
            this.name = name
        } else {
            this.name = '@union' + UnionType.index++
        }
    }

    LE(type2: Type): boolean {
        throw new Error('Method not implemented.')
    }
    accept(visitor: TypeVisitor) {
        throw new Error('Method not implemented.')
    }
    hasVoid(): boolean {
        throw new Error('Method not implemented.')
    }
    toString(): string {
        throw new Error('Method not implemented.')
    }
}

export class SysTypes {
    // 所有类型的父类型
    static Any = new SimpleType('any', [])

    static String = new SimpleType('string', [SysTypes.Any])
    static Number = new SimpleType('number', [SysTypes.Any])
    static Boolean = new SimpleType('boolean', [SysTypes.Any])

    static Null = new SimpleType('null')
    static Undefined = new SimpleType('undefined')

    static Void = new SimpleType('void')

    static Integer = new SimpleType('integer', [SysTypes.Number])
    static Decimal = new SimpleType('decimal', [SysTypes.Number])

    static isSysType(t: Type): boolean {
        return (
            t === SysTypes.Any ||
            t === SysTypes.String ||
            t === SysTypes.Number ||
            t === SysTypes.Boolean ||
            t === SysTypes.Null ||
            t === SysTypes.Undefined ||
            t === SysTypes.Void ||
            t === SysTypes.Integer ||
            t === SysTypes.Decimal
        )
    }
}

export abstract class TypeVisitor {
    visit(t: Type): any {
        return t.accept(this)
    }

    abstract visitSimpleType(t: SimpleType): any
    abstract visitFunctionType(t: FunctionType): any
    abstract visitUnionType(t: UnionType): any
}
