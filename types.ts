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

    static getUpperBound(type1: Type, type2: Type): Type {
        if (type1 == SysTypes.Any || type2 == SysTypes.Any) {
            return SysTypes.Any
        } else {
            if (type1.LE(type2)) {
                return type2
            } else if (type2.LE(type1)) {
                return type1
            } else {
                return new UnionType([type1, type2])
            }
        }
    }

    static isSimpleType(t: Type): boolean {
        return typeof (t as SimpleType).upperTypes == 'object'
    }

    static isUnionType(t: Type): boolean {
        return typeof (t as UnionType).types == 'object'
    }

    static isFunctionType(t: Type): boolean {
        return typeof (t as FunctionType).returnType == 'object'
    }
}

export class SimpleType extends Type {
    upperTypes: Type[]

    constructor(name: string, upperTypes: SimpleType[] = []) {
        super(name)
        this.upperTypes = upperTypes
    }

    LE(type2: Type): boolean {
        if (type2 == SysTypes.Any) {
            return true
        } else if (this == SysTypes.Any) {
            return false
        } else if (this == type2) {
            return true
        } else if (Type.isSimpleType(type2)) {
            let t = type2 as SimpleType
            if (this.upperTypes.indexOf(t) != -1) {
                return true
            } else {
                for (let upperType of this.upperTypes) {
                    if (upperType.LE(type2)) {
                        return true
                    }
                }
                return false
            }
        } else if (Type.isUnionType(type2)) {
            let t = type2 as UnionType
            if (t.types.indexOf(this) != -1) {
                return true
            } else {
                for (let t2 of t.types) {
                    if (this.LE(t2)) {
                        return true
                    }
                }
                return false
            }
        } else {
            return false
        }
    }

    accept(visitor: TypeVisitor) {
        visitor.visitSimpleType(this)
    }

    hasVoid(): boolean {
        if (this == SysTypes.Void) {
            return true
        } else {
            for (let t of this.upperTypes) {
                if (t.hasVoid()) {
                    return true
                }
            }
            return false
        }
    }

    toString(): string {
        let upperTypeName: string = '['
        for (let ut of this.upperTypes) {
            upperTypeName += ut.name + ', '
        }
        upperTypeName += ']'
        return `SimpleType { name: ${this.name}}, upperType: ${upperTypeName} }`
    }
}

export class FunctionType extends Type {
    returnType: Type
    paramTypes: Type[]
    static index: number = 0

    constructor(
        returnType: Type = SysTypes.Void,
        paramTypes: Type[] = [],
        name: string | undefined = undefined
    ) {
        super('@function')
        this.returnType = returnType
        this.paramTypes = paramTypes
        if (typeof name == 'string') {
            this.name = name
        } else {
            this.name = '@function' + FunctionType.index++
        }
    }

    LE(type2: Type): boolean {
        if (type2 == SysTypes.Any) {
            return true
        } else if (this == type2) {
            return true
        } else if (Type.isUnionType(type2)) {
            let t = type2 as UnionType
            if (t.types.indexOf(this) != -1) {
                return true
            } else {
                return false
            }
        } else {
            return false
        }
    }

    accept(visitor: TypeVisitor) {
        return visitor.visitFunctionType(this)
    }

    hasVoid(): boolean {
        return this.returnType.hasVoid()
    }

    toString(): string {
        let paramTypeNames: string = '['
        for (let ut of this.paramTypes) {
            paramTypeNames += ut.name + ', '
        }
        paramTypeNames += ']'
        return `FunctionType {name: ${this.name}, return Type: ${this.returnType.name}, paramTypes: ${this.paramTypes}}`
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
        if (type2 == SysTypes.Any) {
            return true
        } else if (Type.isUnionType(type2)) {
            for (let t1 of this.types) {
                let found = false
                for (let t2 of (type2 as UnionType).types) {
                    if (t1.LE(t2)) {
                        found = true
                        break
                    }
                }
                if (!found) {
                    return false
                }
            }
            return true
        } else {
            return false
        }
    }

    accept(visitor: TypeVisitor): any {
        visitor.visitUnionType(this)
    }

    hasVoid(): boolean {
        for (let t of this.types) {
            if (t.hasVoid()) {
                return true
            }
        }
        return false
    }

    toString(): string {
        let typeNames: string = '['
        for (let ut of this.types) {
            typeNames += ut.name + ', '
        }
        typeNames += ']'
        return `UnionType { name: ${this.name}, typesL ${typeNames} }`
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
