import {
    SemanticTokenModifiers, SemanticTokens, SemanticTokensBuilder, SemanticTokenTypes
} from 'vscode-languageserver/node';

import { UCDocument } from './UC/document';
import {
    IExpression, UCArrayCountExpression, UCBaseOperatorExpression, UCBinaryOperatorExpression,
    UCCallExpression, UCConditionalExpression, UCDefaultMemberCallExpression,
    UCDefaultStructLiteral, UCElementAccessExpression, UCMemberExpression, UCMetaClassExpression,
    UCNameOfExpression, UCObjectLiteral, UCParenthesizedExpression, UCPredefinedAccessExpression,
    UCPropertyAccessExpression, UCSuperExpression
} from './UC/expressions';
import { getDocumentByURI } from './UC/indexer';
import { UCBlock } from './UC/statements';
import {
    FieldModifiers, isFieldSymbol, isParamSymbol, ISymbol, UCFieldSymbol, UCObjectTypeSymbol,
    UCStructSymbol, UCSymbol, UCTypeFlags
} from './UC/Symbols';
import { DefaultSymbolWalker } from './UC/symbolWalker';

export const TokenTypes = [
    SemanticTokenTypes.class,
    SemanticTokenTypes.interface,
    SemanticTokenTypes.namespace,
    SemanticTokenTypes.struct,
    SemanticTokenTypes.enum,
    SemanticTokenTypes.enumMember,
    SemanticTokenTypes.function,
    SemanticTokenTypes.parameter,
    SemanticTokenTypes.property,
    SemanticTokenTypes.keyword,
    SemanticTokenTypes.string,
];

export const TokenModifiers = [
    SemanticTokenModifiers.declaration,
    SemanticTokenModifiers.definition,
    SemanticTokenModifiers.readonly,
    SemanticTokenModifiers.static,
    SemanticTokenModifiers.deprecated,
    SemanticTokenModifiers.defaultLibrary,
];

const TokenTypesMap = {
    [SemanticTokenTypes.class]: 0,
    [SemanticTokenTypes.interface]: 1,
    [SemanticTokenTypes.namespace]: 2,
    [SemanticTokenTypes.struct]: 3,
    [SemanticTokenTypes.enum]: 4,
    [SemanticTokenTypes.enumMember]: 5,
    [SemanticTokenTypes.function]: 6,
    [SemanticTokenTypes.parameter]: 7,
    [SemanticTokenTypes.property]: 8,
    [SemanticTokenTypes.keyword]: 9,
    [SemanticTokenTypes.string]: 10,
};

const TokenModifiersMap = {
    [SemanticTokenModifiers.declaration]: 0,
    [SemanticTokenModifiers.definition]: 1,
    [SemanticTokenModifiers.readonly]: 2,
    [SemanticTokenModifiers.static]: 3,
    [SemanticTokenModifiers.deprecated]: 4,
    [SemanticTokenModifiers.defaultLibrary]: 5,
};

const TypeToTokenTypeIndexMap = {
    [UCTypeFlags.Class]: TokenTypesMap[SemanticTokenTypes.class],
    [UCTypeFlags.Interface]: TokenTypesMap[SemanticTokenTypes.interface],
    [UCTypeFlags.Package]: TokenTypesMap[SemanticTokenTypes.namespace],
    [UCTypeFlags.Struct]: TokenTypesMap[SemanticTokenTypes.struct],
    [UCTypeFlags.Enum]: TokenTypesMap[SemanticTokenTypes.enum],
    [UCTypeFlags.EnumMember]: TokenTypesMap[SemanticTokenTypes.enumMember],
    [UCTypeFlags.Function]: TokenTypesMap[SemanticTokenTypes.function],
    [UCTypeFlags.Property]: TokenTypesMap[SemanticTokenTypes.property],
    [UCTypeFlags.Const]: TokenTypesMap[SemanticTokenTypes.property],
    [UCTypeFlags.String]: TokenTypesMap[SemanticTokenTypes.string],
};

function modifiersFromArray(modifiers: number[]): number {
    const computedModifiers: number = modifiers
        .reduce((a, b) => (a << 1) | b, 0);
    return computedModifiers;
}

export class DocumentSemanticsBuilder extends DefaultSymbolWalker {
    private semanticTokensBuilder = new SemanticTokensBuilder();

    constructor(private document: UCDocument) {
        super();
    }

    public getTokens() {
        return this.semanticTokensBuilder.build();
    }

    private pushSymbol(symbol: UCSymbol, type: number, modifiers: number): void {
        const idRange = symbol.getRange();
        this.semanticTokensBuilder.push(
            idRange.start.line,
            idRange.start.character,
            idRange.end.character - idRange.start.character,
            type,
            modifiers
        );
    }

    // HACK: We need to visit the children in reverse,
    // -- otherwise we end up with non-sorted tokens, which VSCode will ignore.
    // FIXME: This doesn't address the order in @visitClass()
    visitStructBase(symbol: UCStructSymbol) {
        if (symbol.extendsType) {
            symbol.extendsType.accept(this);
        }

        if (symbol.children) {
            const symbols: ISymbol[] = [];
            for (var child: UCFieldSymbol | undefined = symbol.children; child; child = child.next) {
                symbols.push(child);
            }

            for (let i = symbols.length - 1; i >= 0; --i) {
                symbols[i].accept(this);
            }
        }

        if (symbol.block) {
            symbol.block.accept(this);
        }
        return symbol;
    }

    visitBlock(symbol: UCBlock) {
        for (let statement of symbol.statements) if (statement) {
            statement.accept(this);
        }
        return undefined;
    }

    visitObjectType(symbol: UCObjectTypeSymbol): ISymbol {
        let ref: ISymbol | undefined;
        if ((ref = symbol.getRef())) {
            const typeFlags = symbol.getTypeFlags();
            if ((typeFlags & UCTypeFlags.Object) !== 0) {
                let type: number | undefined;
                if (isParamSymbol(ref)) {
                    type = TokenTypesMap[SemanticTokenTypes.parameter];
                } else {
                    type = TypeToTokenTypeIndexMap[typeFlags];
                }

                if (typeof type !== 'undefined') {
                    let modifiers = 0;
                    if (isFieldSymbol(ref)) {
                        if (ref.modifiers & FieldModifiers.ReadOnly) {
                            modifiers |= 1 << TokenModifiersMap[SemanticTokenModifiers.readonly];
                        }
                        if (ref.modifiers & FieldModifiers.Native) {
                            modifiers |= 1 << TokenModifiersMap[SemanticTokenModifiers.defaultLibrary];
                        }
                    }
                    this.pushSymbol(symbol, type, modifiers);
                }
            } else if ((typeFlags & UCTypeFlags.EnumMember) !== 0) {
                // EnumMember
                this.pushSymbol(symbol,
                    TypeToTokenTypeIndexMap[UCTypeFlags.EnumMember],
                    1 << TokenModifiersMap[SemanticTokenModifiers.readonly]
                );
            } else if ((typeFlags & UCTypeFlags.Name) !== 0) {
                this.pushSymbol(symbol,
                    TypeToTokenTypeIndexMap[UCTypeFlags.String],
                    1 << TokenModifiersMap[SemanticTokenModifiers.static]
                );
            }
        }
        return super.visitObjectType(symbol);
    }

    // FIXME: DRY
    // FIXME: Infinite loop in Test.uc
    visitExpression(expr: IExpression) {
        if (expr instanceof UCParenthesizedExpression) {
            expr.expression?.accept(this);
        } else if (expr instanceof UCMetaClassExpression) {
            expr.classRef?.accept(this);
            expr.expression?.accept(this);
        } else if (expr instanceof UCCallExpression) {
            expr.expression.accept(this);
            expr.arguments?.forEach(arg => arg.accept(this));
        } else if (expr instanceof UCElementAccessExpression) {
            expr.expression?.accept(this);
            expr.argument?.accept(this);
        } else if (expr instanceof UCPropertyAccessExpression) {
            expr.left.accept(this);
            expr.member?.accept(this);
        } else if (expr instanceof UCConditionalExpression) {
            expr.condition.accept(this);
            expr.true?.accept(this);
            expr.false?.accept(this);
        } else if (expr instanceof UCBaseOperatorExpression) {
            expr.expression?.accept(this);
        } else if (expr instanceof UCBinaryOperatorExpression) {
            expr.left?.accept(this);
            expr.right?.accept(this);
        } else if (expr instanceof UCDefaultMemberCallExpression) {
            expr.propertyMember.accept(this);
            expr.methodMember.accept(this);
            expr.arguments?.forEach(arg => arg.accept(this));
        } else if (expr instanceof UCMemberExpression) {
            expr.typeRef?.accept(this);
        } else if (expr instanceof UCPredefinedAccessExpression) {
            // Disabled for now, it doesn't look that pretty when namespace tokens are colored like a class type.
            // if (expr.id.name !== NAME_SELF) {
            //     this.pushSymbol(expr.typeRef,
            //         TokenTypesMap[SemanticTokenTypes.namespace],
            //         TokenModifiersMap[SemanticTokenModifiers.readonly]
            //     );
            // }
        } else if (expr instanceof UCSuperExpression) {
            expr.structTypeRef?.accept(this);
        } else if (expr instanceof UCDefaultStructLiteral) {
            expr.arguments?.forEach(arg => arg?.accept<any>(this));
        } else if (expr instanceof UCObjectLiteral) {
            expr.objectRef?.accept(this);
        } else if (expr instanceof UCArrayCountExpression) {
            expr.argument?.accept(this);
        } else if (expr instanceof UCNameOfExpression) {
            expr.argument?.accept(this);
        }
        return super.visitExpression(expr);
    }
}

export async function getSemanticTokens(uri: string): Promise<SemanticTokens> {
    const document = getDocumentByURI(uri);
    if (!document) {
        return {
            data: []
        };
    }

    const walker = new DocumentSemanticsBuilder(document);
    document.accept(walker);

    return walker.getTokens();
}