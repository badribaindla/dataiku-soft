'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.SymbolTable = exports.SystemVariableSymbol = exports.UserVariableSymbol = exports.CollationSymbol = exports.CharsetSymbol = exports.LogfileGroupSymbol = exports.TableSpaceSymbol = exports.EngineSymbol = exports.UdfSymbol = exports.TriggerSymbol = exports.StoredRoutineSymbol = exports.ForeignKeySymbol = exports.PrimaryKeySymbol = exports.IndexSymbol = exports.ColumnSymbol = exports.EventSymbol = exports.ViewSymbol = exports.TableSymbol = exports.SchemaSymbol = exports.CatalogSymbol = exports.ArrayType = exports.ClassSymbol = exports.FieldSymbol = exports.MethodSymbol = exports.MethodFlags = exports.RoutineSymbol = exports.ParameterSymbol = exports.LiteralSymbol = exports.VariableSymbol = exports.NamespaceSymbol = exports.ScopedSymbol = exports.TypeAlias = exports.TypedSymbol = exports.Symbol = exports.FundamentalType = exports.ReferenceKind = exports.TypeKind = exports.MemberVisibility = exports.DuplicateSymbolError = void 0;
class DuplicateSymbolError extends Error {
}
exports.DuplicateSymbolError = DuplicateSymbolError;
;
var MemberVisibility;
(function (MemberVisibility) {
    MemberVisibility[MemberVisibility["Invalid"] = -1] = "Invalid";
    MemberVisibility[MemberVisibility["Public"] = 0] = "Public";
    MemberVisibility[MemberVisibility["Protected"] = 1] = "Protected";
    MemberVisibility[MemberVisibility["Private"] = 2] = "Private";
    MemberVisibility[MemberVisibility["Library"] = 3] = "Library";
})(MemberVisibility = exports.MemberVisibility || (exports.MemberVisibility = {}));
;
var TypeKind;
(function (TypeKind) {
    TypeKind[TypeKind["Integer"] = 0] = "Integer";
    TypeKind[TypeKind["Float"] = 1] = "Float";
    TypeKind[TypeKind["String"] = 2] = "String";
    TypeKind[TypeKind["Boolean"] = 3] = "Boolean";
    TypeKind[TypeKind["Date"] = 4] = "Date";
    TypeKind[TypeKind["Class"] = 5] = "Class";
    TypeKind[TypeKind["Array"] = 6] = "Array";
    TypeKind[TypeKind["Alias"] = 7] = "Alias";
})(TypeKind = exports.TypeKind || (exports.TypeKind = {}));
;
var ReferenceKind;
(function (ReferenceKind) {
    ReferenceKind[ReferenceKind["Irrelevant"] = 0] = "Irrelevant";
    ReferenceKind[ReferenceKind["Pointer"] = 1] = "Pointer";
    ReferenceKind[ReferenceKind["Reference"] = 2] = "Reference";
    ReferenceKind[ReferenceKind["Instance"] = 3] = "Instance";
})(ReferenceKind = exports.ReferenceKind || (exports.ReferenceKind = {}));
;
class FundamentalType {
    constructor(name, typeKind, referenceKind) {
        this.name = name;
        this.typeKind = typeKind;
        this.referenceKind = referenceKind;
    }
    get baseTypes() { return []; }
    get kind() { return this.typeKind; }
    get reference() { return this.referenceKind; }
}
exports.FundamentalType = FundamentalType;
FundamentalType.integerType = new FundamentalType("int", TypeKind.Integer, ReferenceKind.Instance);
FundamentalType.floatType = new FundamentalType("float", TypeKind.Float, ReferenceKind.Instance);
FundamentalType.stringType = new FundamentalType("string", TypeKind.String, ReferenceKind.Instance);
FundamentalType.boolType = new FundamentalType("bool", TypeKind.Boolean, ReferenceKind.Instance);
FundamentalType.dateType = new FundamentalType("date", TypeKind.Date, ReferenceKind.Instance);
class Symbol {
    constructor(name = "") {
        this.name = "";
        this.name = name;
    }
    setParent(parent) {
        this.parent = parent;
    }
    getParent() {
        return this.parent;
    }
    removeFromParent() {
        if (this.parent instanceof ScopedSymbol) {
            this.parent.removeSymbol(this);
            this.parent = undefined;
        }
    }
    getRoot() {
        let run = this.parent;
        while (run) {
            if (!run.parent || (run.parent instanceof SymbolTable))
                return run;
            run = run.parent;
        }
        return run;
    }
    getSymbolTable() {
        if (this instanceof SymbolTable) {
            return this;
        }
        let run = this.parent;
        while (run) {
            if (run instanceof SymbolTable)
                return run;
            run = run.parent;
        }
        return undefined;
    }
    getParentOfType(t) {
        let run = this.parent;
        while (run) {
            if (run instanceof t)
                return run;
            run = run.parent;
        }
        return undefined;
    }
    getSymbolPath() {
        let result = [];
        let run = this;
        while (run) {
            result.push(run);
            if (!run.parent)
                break;
            run = run.parent;
        }
        return result;
    }
    qualifiedName(separator = ".", full = false, includeAnonymous = false) {
        if (!includeAnonymous && this.name.length == 0)
            return "";
        let result = this.name.length == 0 ? "<anonymous>" : this.name;
        let run = this.parent;
        while (run) {
            if (includeAnonymous || run.name.length > 0) {
                result = (run.name.length == 0 ? "<anonymous>" : run.name) + separator + result;
                if (!full || !run.parent)
                    break;
            }
            run = run.parent;
        }
        return result;
    }
}
exports.Symbol = Symbol;
;
class TypedSymbol extends Symbol {
    constructor(name, type) {
        super(name);
        this.type = type;
    }
}
exports.TypedSymbol = TypedSymbol;
;
class TypeAlias extends Symbol {
    constructor(name, target) {
        super(name);
        this.targetType = target;
    }
    get baseTypes() { return [this.targetType]; }
    get kind() { return TypeKind.Alias; }
    get reference() { return ReferenceKind.Irrelevant; }
}
exports.TypeAlias = TypeAlias;
;
class ScopedSymbol extends Symbol {
    constructor(name = "") {
        super(name);
        this.children = [];
    }
    addSymbol(symbol) {
        symbol.removeFromParent();
        let symbolTable = this.getSymbolTable();
        if (!symbolTable || !symbolTable.options.allowDuplicateSymbols) {
            for (let child of this.children) {
                if (child == symbol || (symbol.name.length > 0 && child.name == symbol.name)) {
                    let name = symbol.name;
                    if (name.length == 0)
                        name = "<anonymous>";
                    throw new DuplicateSymbolError("Attempt to add duplicate symbol '" + name + "'");
                }
            }
        }
        this.children.push(symbol);
        symbol.setParent(this);
    }
    removeSymbol(symbol) {
        let index = this.children.indexOf(symbol);
        if (index > -1) {
            this.children.splice(index, 1);
            symbol.setParent(undefined);
        }
    }
    getSymbolsOfType(t) {
        let result = [];
        for (let child of this.children) {
            if (child instanceof t)
                result.push(child);
        }
        return result;
    }
    getNestedSymbolsOfType(t) {
        let result = [];
        for (let child of this.children) {
            if (child instanceof t)
                result.push(child);
            if (child instanceof ScopedSymbol)
                result.push(...child.getNestedSymbolsOfType(t));
        }
        return result;
    }
    getAllNestedSymbols() {
        let result = [];
        for (let child of this.children) {
            result.push(child);
            if (child instanceof ScopedSymbol)
                result.push(...child.getAllNestedSymbols());
        }
        return result;
    }
    getAllSymbols(t, localOnly = false) {
        let result = [];
        for (let child of this.children) {
            if (child instanceof t) {
                result.push(child);
            }
            if (child instanceof NamespaceSymbol)
                result.push(...child.getAllSymbols(t, true));
        }
        if (!localOnly) {
            if (this.parent && this.parent instanceof ScopedSymbol)
                result.push(...this.parent.getAllSymbols(t));
        }
        return result;
    }
    resolve(name, localOnly = false) {
        for (let child of this.children) {
            if (child.name == name)
                return child;
        }
        if (!localOnly) {
            if (this.parent && this.parent instanceof ScopedSymbol)
                return this.parent.resolve(name, false);
        }
        return undefined;
    }
    getTypedSymbols(localOnly = true) {
        let result = [];
        for (let child of this.children) {
            if (child instanceof TypedSymbol) {
                result.push(child);
            }
        }
        if (!localOnly) {
            if (this.parent instanceof ScopedSymbol) {
                let localList = this.parent.getTypedSymbols(true);
                result.push(...localList);
            }
        }
        return result;
    }
    getTypedSymbolNames(localOnly = true) {
        let result = [];
        for (let child of this.children) {
            if (child instanceof TypedSymbol) {
                result.push(child.name);
            }
        }
        if (!localOnly) {
            if (this.parent instanceof ScopedSymbol) {
                let localList = this.parent.getTypedSymbolNames(true);
                result.push(...localList);
            }
        }
        return result;
    }
    getDirectScopes() {
        return this.getSymbolsOfType(ScopedSymbol);
    }
    symbolFromPath(path, separator = ".") {
        let elements = path.split(separator);
        let index = 0;
        if (elements[0] == this.name || elements[0].length == 0)
            ++index;
        let result = this;
        while (index < elements.length) {
            if (!(result instanceof ScopedSymbol))
                return undefined;
            let child = result.children.find(child => child.name == elements[index]);
            if (!child)
                return undefined;
            result = child;
            ++index;
        }
        return result;
    }
}
exports.ScopedSymbol = ScopedSymbol;
;
class NamespaceSymbol extends ScopedSymbol {
}
exports.NamespaceSymbol = NamespaceSymbol;
class VariableSymbol extends TypedSymbol {
    constructor(name, value, type) {
        super(name, type);
        this.value = value;
    }
}
exports.VariableSymbol = VariableSymbol;
;
class LiteralSymbol extends TypedSymbol {
    constructor(name, value, type) {
        super(name, type);
        this.value = value;
    }
}
exports.LiteralSymbol = LiteralSymbol;
;
class ParameterSymbol extends VariableSymbol {
}
exports.ParameterSymbol = ParameterSymbol;
;
class RoutineSymbol extends ScopedSymbol {
    constructor(name, returnType) {
        super(name);
        this.returnType = returnType;
    }
    getVariables(localOnly = true) {
        return this.getSymbolsOfType(VariableSymbol);
    }
    getParameters(localOnly = true) {
        return this.getSymbolsOfType(ParameterSymbol);
    }
}
exports.RoutineSymbol = RoutineSymbol;
;
var MethodFlags;
(function (MethodFlags) {
    MethodFlags[MethodFlags["None"] = 0] = "None";
    MethodFlags[MethodFlags["Virtual"] = 1] = "Virtual";
    MethodFlags[MethodFlags["Const"] = 2] = "Const";
    MethodFlags[MethodFlags["Overwritten"] = 4] = "Overwritten";
    MethodFlags[MethodFlags["SetterOrGetter"] = 8] = "SetterOrGetter";
    MethodFlags[MethodFlags["Explicit"] = 16] = "Explicit";
})(MethodFlags = exports.MethodFlags || (exports.MethodFlags = {}));
;
class MethodSymbol extends RoutineSymbol {
    constructor(name, returnType) {
        super(name, returnType);
        this.methodFlags = MethodFlags.None;
        this.visibility = MemberVisibility.Invalid;
    }
}
exports.MethodSymbol = MethodSymbol;
;
class FieldSymbol extends VariableSymbol {
    constructor(name, type) {
        super(name, type);
        this.visibility = MemberVisibility.Invalid;
    }
}
exports.FieldSymbol = FieldSymbol;
;
class ClassSymbol extends ScopedSymbol {
    constructor(name, referenceKind, ...superClass) {
        super(name);
        this.isStruct = false;
        this.superClasses = [];
        this.referenceKind = referenceKind;
        this.superClasses.push(...superClass);
    }
    get baseTypes() { return this.superClasses; }
    ;
    get kind() { return TypeKind.Class; }
    get reference() { return this.referenceKind; }
    getMethods(includeInherited = false) {
        return this.getSymbolsOfType(MethodSymbol);
    }
    getFields(includeInherited = false) {
        return this.getSymbolsOfType(FieldSymbol);
    }
}
exports.ClassSymbol = ClassSymbol;
;
class ArrayType extends Symbol {
    constructor(name, referenceKind, elemType, size = 0) {
        super(name);
        this.referenceKind = referenceKind;
        this.elementType = elemType;
        this.size = size;
    }
    get baseTypes() { return []; }
    ;
    get kind() { return TypeKind.Array; }
    get reference() { return this.referenceKind; }
}
exports.ArrayType = ArrayType;
;
class CatalogSymbol extends ScopedSymbol {
}
exports.CatalogSymbol = CatalogSymbol;
;
class SchemaSymbol extends ScopedSymbol {
}
exports.SchemaSymbol = SchemaSymbol;
;
class TableSymbol extends ScopedSymbol {
}
exports.TableSymbol = TableSymbol;
;
class ViewSymbol extends ScopedSymbol {
}
exports.ViewSymbol = ViewSymbol;
;
class EventSymbol extends ScopedSymbol {
}
exports.EventSymbol = EventSymbol;
;
class ColumnSymbol extends TypedSymbol {
}
exports.ColumnSymbol = ColumnSymbol;
;
class IndexSymbol extends Symbol {
}
exports.IndexSymbol = IndexSymbol;
;
class PrimaryKeySymbol extends Symbol {
}
exports.PrimaryKeySymbol = PrimaryKeySymbol;
;
class ForeignKeySymbol extends Symbol {
}
exports.ForeignKeySymbol = ForeignKeySymbol;
;
class StoredRoutineSymbol extends RoutineSymbol {
}
exports.StoredRoutineSymbol = StoredRoutineSymbol;
;
class TriggerSymbol extends ScopedSymbol {
}
exports.TriggerSymbol = TriggerSymbol;
;
class UdfSymbol extends Symbol {
}
exports.UdfSymbol = UdfSymbol;
;
class EngineSymbol extends Symbol {
}
exports.EngineSymbol = EngineSymbol;
;
class TableSpaceSymbol extends Symbol {
}
exports.TableSpaceSymbol = TableSpaceSymbol;
;
class LogfileGroupSymbol extends Symbol {
}
exports.LogfileGroupSymbol = LogfileGroupSymbol;
;
class CharsetSymbol extends Symbol {
}
exports.CharsetSymbol = CharsetSymbol;
;
class CollationSymbol extends Symbol {
}
exports.CollationSymbol = CollationSymbol;
;
class UserVariableSymbol extends VariableSymbol {
}
exports.UserVariableSymbol = UserVariableSymbol;
;
class SystemVariableSymbol extends Symbol {
}
exports.SystemVariableSymbol = SystemVariableSymbol;
;
class SymbolTable extends ScopedSymbol {
    constructor(name, options) {
        super(name);
        this.options = options;
        this.dependencies = new Set();
    }
    clear() {
        this.dependencies.clear();
        this.children = [];
    }
    addDependencies(...tables) {
        tables.forEach((value, key) => {
            this.dependencies.add(value);
        });
    }
    removeDependency(table) {
        if (this.dependencies.has(table)) {
            this.dependencies.delete(table);
        }
    }
    getInfo() {
        return {
            dependencyCount: this.dependencies.size,
            symbolCount: this.children.length
        };
    }
    addNewSymbolOfType(t, parent, ...args) {
        let result = new t(...args);
        if (!parent || parent == this) {
            this.addSymbol(result);
        }
        else {
            parent.addSymbol(result);
        }
        return result;
    }
    addNewNamespaceFromPath(parent, path, delimiter = ".") {
        let parts = path.split(delimiter);
        let i = 0;
        let currentParent = (parent == undefined) ? this : parent;
        while (i < parts.length - 1) {
            let namespace = currentParent.resolve(parts[i], true);
            if (namespace == undefined) {
                namespace = this.addNewSymbolOfType(NamespaceSymbol, currentParent, parts[i]);
            }
            currentParent = namespace;
            ++i;
        }
        return this.addNewSymbolOfType(NamespaceSymbol, currentParent, parts[parts.length - 1]);
    }
    getAllSymbols(t, localOnly = false) {
        let type = t ? t : Symbol;
        let result = super.getAllSymbols(type, localOnly);
        if (!localOnly) {
            for (let dependency of this.dependencies) {
                result.push(...dependency.getAllSymbols(t, localOnly));
            }
        }
        return result;
    }
    resolve(name, localOnly = false) {
        let result = super.resolve(name, localOnly);
        if (!result && !localOnly) {
            for (let dependency of this.dependencies) {
                result = dependency.resolve(name, false);
                if (result)
                    break;
            }
        }
        return result;
    }
}
exports.SymbolTable = SymbolTable;
;
//# sourceMappingURL=SymbolTable.js.map