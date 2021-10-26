import { ParserRuleContext } from 'antlr4ts';
export declare class DuplicateSymbolError extends Error {
}
export declare enum MemberVisibility {
    Invalid = -1,
    Public = 0,
    Protected = 1,
    Private = 2,
    Library = 3
}
export declare enum TypeKind {
    Integer = 0,
    Float = 1,
    String = 2,
    Boolean = 3,
    Date = 4,
    Class = 5,
    Array = 6,
    Alias = 7
}
export declare enum ReferenceKind {
    Irrelevant = 0,
    Pointer = 1,
    Reference = 2,
    Instance = 3
}
export interface Type {
    name: string;
    baseTypes: Type[];
    kind: TypeKind;
    reference: ReferenceKind;
}
export interface SymbolTableOptions {
    allowDuplicateSymbols?: boolean;
}
export declare class FundamentalType implements Type {
    name: string;
    get baseTypes(): Type[];
    get kind(): TypeKind;
    get reference(): ReferenceKind;
    static readonly integerType: FundamentalType;
    static readonly floatType: FundamentalType;
    static readonly stringType: FundamentalType;
    static readonly boolType: FundamentalType;
    static readonly dateType: FundamentalType;
    constructor(name: string, typeKind: TypeKind, referenceKind: ReferenceKind);
    private typeKind;
    private referenceKind;
}
export declare class Symbol {
    name: string;
    context: ParserRuleContext | undefined;
    protected parent: Symbol | undefined;
    constructor(name?: string);
    setParent(parent: Symbol | undefined): void;
    getParent(): Symbol | undefined;
    removeFromParent(): void;
    getRoot(): Symbol | undefined;
    getSymbolTable(): SymbolTable | undefined;
    getParentOfType<T extends Symbol>(t: new (...args: any[]) => T): T | undefined;
    getSymbolPath(): Symbol[];
    qualifiedName(separator?: string, full?: boolean, includeAnonymous?: boolean): string;
}
export declare class TypedSymbol extends Symbol {
    type: Type | undefined;
    constructor(name: string, type?: Type);
}
export declare class TypeAlias extends Symbol implements Type {
    get baseTypes(): Type[];
    get kind(): TypeKind;
    get reference(): ReferenceKind;
    constructor(name: string, target: Type);
    private targetType;
}
export declare class ScopedSymbol extends Symbol {
    constructor(name?: string);
    addSymbol(symbol: Symbol): void;
    removeSymbol(symbol: Symbol): void;
    getSymbolsOfType<T extends Symbol>(t: new (...args: any[]) => T): T[];
    getNestedSymbolsOfType<T extends Symbol>(t: new (...args: any[]) => T): T[];
    getAllNestedSymbols(): Symbol[];
    getAllSymbols<T extends Symbol>(t: new (...args: any[]) => T, localOnly?: boolean): Symbol[];
    resolve(name: string, localOnly?: boolean): Symbol | undefined;
    getTypedSymbols(localOnly?: boolean): TypedSymbol[];
    getTypedSymbolNames(localOnly?: boolean): string[];
    getDirectScopes(): ScopedSymbol[];
    symbolFromPath(path: string, separator?: string): Symbol | undefined;
    protected children: Symbol[];
}
export declare class NamespaceSymbol extends ScopedSymbol {
}
export declare class VariableSymbol extends TypedSymbol {
    constructor(name: string, value: any, type?: Type);
    value: any;
}
export declare class LiteralSymbol extends TypedSymbol {
    constructor(name: string, value: any, type?: Type);
    readonly value: any;
}
export declare class ParameterSymbol extends VariableSymbol {
}
export declare class RoutineSymbol extends ScopedSymbol {
    returnType: Type | undefined;
    constructor(name: string, returnType: Type);
    getVariables(localOnly?: boolean): VariableSymbol[];
    getParameters(localOnly?: boolean): ParameterSymbol[];
}
export declare enum MethodFlags {
    None = 0,
    Virtual = 1,
    Const = 2,
    Overwritten = 4,
    SetterOrGetter = 8,
    Explicit = 16
}
export declare class MethodSymbol extends RoutineSymbol {
    methodFlags: MethodFlags;
    visibility: MemberVisibility;
    constructor(name: string, returnType: Type);
}
export declare class FieldSymbol extends VariableSymbol {
    visibility: MemberVisibility;
    setter: MethodSymbol | undefined;
    getter: MethodSymbol | undefined;
    constructor(name: string, type: Type);
}
export declare class ClassSymbol extends ScopedSymbol implements Type {
    get baseTypes(): Type[];
    get kind(): TypeKind;
    get reference(): ReferenceKind;
    isStruct: boolean;
    readonly superClasses: ClassSymbol[];
    constructor(name: string, referenceKind: ReferenceKind, ...superClass: ClassSymbol[]);
    getMethods(includeInherited?: boolean): MethodSymbol[];
    getFields(includeInherited?: boolean): FieldSymbol[];
    private referenceKind;
}
export declare class ArrayType extends Symbol implements Type {
    get baseTypes(): Type[];
    get kind(): TypeKind;
    get reference(): ReferenceKind;
    readonly elementType: Type;
    readonly size: number;
    constructor(name: string, referenceKind: ReferenceKind, elemType: Type, size?: number);
    private referenceKind;
}
export declare class CatalogSymbol extends ScopedSymbol {
}
export declare class SchemaSymbol extends ScopedSymbol {
}
export declare class TableSymbol extends ScopedSymbol {
}
export declare class ViewSymbol extends ScopedSymbol {
}
export declare class EventSymbol extends ScopedSymbol {
}
export declare class ColumnSymbol extends TypedSymbol {
}
export declare class IndexSymbol extends Symbol {
}
export declare class PrimaryKeySymbol extends Symbol {
}
export declare class ForeignKeySymbol extends Symbol {
}
export declare class StoredRoutineSymbol extends RoutineSymbol {
}
export declare class TriggerSymbol extends ScopedSymbol {
}
export declare class UdfSymbol extends Symbol {
}
export declare class EngineSymbol extends Symbol {
}
export declare class TableSpaceSymbol extends Symbol {
}
export declare class LogfileGroupSymbol extends Symbol {
}
export declare class CharsetSymbol extends Symbol {
}
export declare class CollationSymbol extends Symbol {
}
export declare class UserVariableSymbol extends VariableSymbol {
}
export declare class SystemVariableSymbol extends Symbol {
}
export declare class SymbolTable extends ScopedSymbol {
    readonly options: SymbolTableOptions;
    constructor(name: string, options: SymbolTableOptions);
    clear(): void;
    addDependencies(...tables: SymbolTable[]): void;
    removeDependency(table: SymbolTable): void;
    getInfo(): {
        dependencyCount: number;
        symbolCount: number;
    };
    addNewSymbolOfType<T extends Symbol>(t: new (...args: any[]) => T, parent: ScopedSymbol | undefined, ...args: any[]): T;
    addNewNamespaceFromPath(parent: ScopedSymbol | undefined, path: string, delimiter?: string): NamespaceSymbol;
    getAllSymbols<T extends Symbol>(t?: new (...args: any[]) => T, localOnly?: boolean): Symbol[];
    resolve(name: string, localOnly?: boolean): Symbol | undefined;
    protected dependencies: Set<SymbolTable>;
}
