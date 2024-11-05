import { Token } from 'antlr4ts';
import { FormatContext, IFormatInfo, IFormatRule } from 'documentFormater';
import { UCParser } from 'UC/antlr/generated/UCParser';
import { UCMemberExpression } from 'UC/expressions';
import { intersectsWith } from 'UC/helpers';
import { UCArchetypeBlockStatement, UCBlock, UCExpressionStatement, UCForStatement, UCIfStatement, UCRepIfStatement } from 'UC/statements';
import { isMethodSymbol, isNode, isScriptStructSymbol, isStatement, isSymbol, UCClassSymbol, UCFieldSymbol, UCMethodSymbol, UCNodeKind, UCPropertySymbol, UCStructSymbol, UCSymbolKind } from 'UC/Symbols';
import { Position, Range, SymbolKind } from 'vscode-languageserver';

export class LineIndentRule implements IFormatRule {


    prevLine = -1;
    // indent: number[] = [9999]

    Format(ctx: FormatContext, currentToken: Token): IFormatInfo[] {
        const res: IFormatInfo[] = [];


        if (currentToken.line != this.prevLine) {

            const nextToken = ctx.tryGetNextToken(currentToken);

            if (currentToken.type != UCParser.LINE_COMMENT  //ignore line comment
                && currentToken.type != UCParser.BLOCK_COMMENT //ignore block comment
                && (!nextToken || (nextToken.type != UCParser.LINE_COMMENT && nextToken.type != UCParser.BLOCK_COMMENT))
            ) {
                let currentTokenLineNumber = currentToken.line - 1;
                if (currentToken.type === UCParser.OPEN_BRACE
                    || (nextToken && nextToken.type === UCParser.OPEN_BRACE)) {
                    // fix add new line after '{':
                    // current token is '{'
                    // --------------------
                    // if(b)
                    // { xxx;          <----------- wrong indent here, '{' should not use 'xxx;' as indent content
                    // }
                    // --------------------

                    // current token is 'WS', next token is '{'
                    // --------------------
                    // if(b)
                    // {
                    //      if(bb)
                    //      {xxx;      <----------- wrong indent here, '{' should not use 'xxx;' as indent content
                    //      }
                    // }
                    // --------------------

                    // use last line to hack fix for it.
                    currentTokenLineNumber -= 1;
                }
                ctx.indentLevel = 0;
                const curTokenDocPosition = Position.create(currentTokenLineNumber, currentToken.charPositionInLine);
                if (ctx.document.class) {
                    const docContent = ctx.document.class
                    if (docContent) {
                        this.setCtxIndentWrapper(ctx, docContent, { currentToken: currentToken, positionInDoc: curTokenDocPosition });
                    }
                }

                // this.indent.push(ctx.indentLevel)

                let actualIndentCount = 0;
                let actualIndent = ""
                if (currentToken.type == UCParser.WS) {
                    actualIndentCount = this.getIndentCount(ctx, currentToken.text ?? "")
                    actualIndent = currentToken.text ?? ""
                }
                const expectIndent = ctx.indextString.repeat(ctx.indentLevel);
                const expectIndentCount = this.getIndentCount(ctx, expectIndent)
                if (actualIndentCount != expectIndentCount) {
                    res.push({
                        line: currentToken.line - 1,
                        position: 0,
                        length: actualIndent.length,
                        fixedText: expectIndent
                    })
                }


            } else {
                // this.indent.push(-9999)
            }
        }


        this.prevLine = currentToken.line;


        return res;
    }


    getIndentCount(ctx: FormatContext, indent: string) {
        let count = 0;
        if (indent.length === 0) {
            return count;
        }
        for (let index = 0; index < indent.length; index++) {
            const character = indent[index];
            if (character === '\t') {
                count += ctx.formatOption.tabSize;
            }
            else if (character === ' ') {
                count += 1;
            }
            else {
                break;
            }
        }
        return count;
    }


    setCtxIndent(ctx: FormatContext, content: IContent | undefined, currentTokenInfo: ICurrentTokenInfo) {
        if (!content) {
            return;
        }
        // Not in the content range, jump to next
        if (!(currentTokenInfo.positionInDoc.line >= content.range.start.line && currentTokenInfo.positionInDoc.line <= content.range.end.line)) {
            if (content.next) {
                content.next._outerContent = content;
                this.setCtxIndentWrapper(ctx, content.next, currentTokenInfo);
            }
            // class symbol is special,
            // if a content is not in class 'range', it might be in class 'children' property
            // because class 'range' only contains the class definition parts
            if (content instanceof UCClassSymbol) {
                if (content.children) {
                    this.setCtxIndentWrapper(ctx, content.children, currentTokenInfo);
                }
            }
            return;
        }

        const outerContent = content._outerContent;

        if (ctx.isInDefaultPropertiesScope && content instanceof UCArchetypeBlockStatement) {
            // add indent for 'begin object' and 'end object'
            // this block is special
            // if we find all subcontents in it. 'UCArchetypeSymbol' and 'UCBlock' will be found.
            // both of them have the same range as 'UCArchetypeBlockStatement'.
            // 'UCArchetypeSymbol' is fine but 'UCBlock' will add another level of indent,
            // that will cause an extra indent before 'begin object' and 'end object'
            // so we just return if current token line == 'UCArchetypeBlockStatement' range start line or end line
            if (currentTokenInfo.positionInDoc.line == content.range.start.line || currentTokenInfo.positionInDoc.line == content.range.end.line) {
                return;
            }
        }

        if (ctx.isInRepliactionScope && content instanceof UCRepIfStatement) {
            // add indent for replication variables in different line
            if (currentTokenInfo.positionInDoc.line > content.range.start.line) {
                ctx.indentLevel++;
                return;
            }
        }

        // Find all value with 'range' property but except 'outer' and 'id'
        let subContents = Object.entries(content).filter(entry => {
            return entry[0] != "outer"  // dont want to go backwards
                && entry[0] != "id"     // it has no useful info
                && entry[0] != "type"
                // && entry[0] != "next"    // include 'next' because 'post operator expression' of 'for statement' is in 'next'
                && entry[0] != "reference"  // we dont need to go into this detail symbol info
                && entry[0] != "_outerContent"  // extra info for line indent only, dont want to go backwards

                && entry[0] != "extendsType"    // 'class' or 'UCCLassSymbol' has 'extendsType', we dont need to go into this detail info
                && entry[0] != "defaults"   // 'class' or 'UCCLassSymbol' has 'defaults', we dont need to go into this detail info
                && entry[0] != "withinType"   // 'class' or 'UCCLassSymbol'
                && entry[0] != "within"   // 'class' or 'UCCLassSymbol'
                && entry[0] != "dependsOnTypes"   // 'class' or 'UCCLassSymbol'
                && entry[0] != "implementsTypes"   // 'class' or 'UCCLassSymbol'
                && entry[0] != "super"   // 'class' or 'UCCLassSymbol'
                && entry[0] != "overriddenMethod"

                && typeof entry[1] == "object"
                && (entry[1] as Object).hasOwnProperty("range");
        }).map(entry => entry[1] as IContent)

        subContents = removeSamelineContent(content, subContents);

        for (let index = 0; index < subContents.length; index++) {
            const subContent = subContents[index];
            subContent._outerContent = content;
            this.setCtxIndentWrapper(ctx, subContent, currentTokenInfo);
        }



        if (content instanceof UCBlock) {
            // check 'else if'
            // do not increase indent level in this 'else if' line
            // but we can not distinguish

            // --------------------
            // if(foo)
            // {
            // }
            // else if(bar)
            // {
            // }
            // --------------------

            // and

            // --------------------
            // if(foo)
            // {
            // }
            // else
            // {
            //     if(bar)
            //     {
            //     }
            // }
            // --------------------

            // in the document tree, they are all the same
            // try use regex hack it for now
            const reg = /else\s+if/ig;

            const isInElseIf =
                content.statements.length === 1
                && content.statements[0] instanceof UCIfStatement
                && reg.test(ctx.getInLineStrByLine(content.range.start.line + 1))
                ;

            if (!isInElseIf) {
                ctx.indentLevel++;
            }


            const statements = removeSamelineContent(content, content.statements)
            for (let index = 0; index < statements.length; index++) {
                const statement = statements[index];
                (statement as IContent)._outerContent = content;
                this.setCtxIndentWrapper(ctx, statement, currentTokenInfo);
            }
        }


        // add indent for class definition in different line
        if (content instanceof UCClassSymbol) {
            if (currentTokenInfo.positionInDoc.line != content.range.start.line) {
                ctx.indentLevel++;
            }
        }

        if (content instanceof UCPropertySymbol) {
            // add indent for local variable in 'function'
            if (content.outer instanceof UCMethodSymbol && isMethodSymbol(content.outer)) {
                // skip function paramter in the same line
                if (content.range.start.line != content.outer.range.start.line) {
                    ctx.indentLevel++;
                }
            }
            // add indent for properties in 'struct'
            if (content.outer instanceof UCStructSymbol && isScriptStructSymbol(content.outer)) {
                ctx.indentLevel++;
            }
        }


        if (!isNode(content) || (isNode(content) && !isStatement(content))) {
            const outerStatement: UCExpressionStatement | undefined = this.findOuterStatement(content);
            // add indent for condition expression in different line 'if'
            // e.g.
            // if(aaa
            //    &&bbb)
            if (outerStatement instanceof UCIfStatement
                && content.range.start.line != outerStatement.range.start.line
            ) {
                ctx.indentLevel++;
            }
            //add indent for different line 'for'
            // e.g.
            // for(i=1;
            //     i<50;
            //     i++;)
            if (outerStatement instanceof UCForStatement
                && content.range.start.line != outerStatement.range.start.line
            ) {
                ctx.indentLevel++;
            }
        }


    }

    findOuterStatement(outerContent: IContent | undefined): UCExpressionStatement | undefined {
        if (!outerContent) {
            return undefined;
        }
        while (!(outerContent instanceof UCExpressionStatement)) {
            outerContent = outerContent._outerContent;
            if (!outerContent) {
                return undefined;
            }
        }
        return outerContent;
    }



    private setCtxIndentWrapper(ctx: FormatContext, content: IContent | undefined, currentTokenInfo: ICurrentTokenInfo) {
        if (!content) {
            return
        }
        let symbolKind = UCSymbolKind.None;
        if (isSymbol(content)) {
            symbolKind = content.kind;
        }

        //pre set warpper
        switch (symbolKind) {
            case UCSymbolKind.ReplicationBlock:
                ctx.isInRepliactionScope = true;
                break;
        }

        //set
        this.setCtxIndent(ctx, content, currentTokenInfo);

        //post set warpper
        switch (symbolKind) {
            case UCSymbolKind.ReplicationBlock:
                ctx.isInRepliactionScope = false;   //TODO: this is more like a line indent ctx scope, only can be used in this rule. can not share scope info to other rules.
                break;
        }
    }

}

interface IContent {
    range: Range
    next?: IContent
    _outerContent?: IContent
    kind?: UCSymbolKind | UCNodeKind
}

interface ICurrentTokenInfo {
    currentToken: Token
    positionInDoc: Position
}

function removeSamelineContent(content: IContent, subContents: (IContent | undefined)[]): IContent[] {
    // return subContents as any;
    const contentLineSet = new Set<number>();
    // const contentClassSet = new Set<Object>();
    if (content.range.start.line == content.range.end.line) {
        contentLineSet.add(content.range.start.line);
    }
    // contentClassSet.add(Object.getPrototypeOf(content));
    const res: IContent[] = []
    subContents.forEach(con => {
        if (con) {
            if (con.range.start.line != con.range.end.line) {
                res.push(con);
            } else {
                // one line content
                // const proto = Object.getPrototypeOf(con);
                if (!contentLineSet.has(con.range.start.line)) {
                    res.push(con);
                    contentLineSet.add(con.range.start.line);
                    // contentClassSet.add(proto);
                }
            }
        }
    })
    return res;
}
