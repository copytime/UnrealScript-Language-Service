import { Token } from 'antlr4ts';
import { FormatContext, IFormatInfo, IFormatRule } from 'documentFormater';
import { UCParser } from 'UC/antlr/generated/UCParser';
import { UCMemberExpression } from 'UC/expressions';
import { intersectsWith } from 'UC/helpers';
import { UCBlock, UCExpressionStatement, UCForStatement, UCIfStatement } from 'UC/statements';
import { isStatement, isSymbol, UCClassSymbol, UCFieldSymbol, UCMethodSymbol, UCPropertySymbol } from 'UC/Symbols';
import { Position, Range } from 'vscode-languageserver';

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
                this.getTokenExpectedIndent(ctx, currentToken);

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


    getTokenExpectedIndent(ctx: FormatContext, curToken: Token) {
        ctx.indentLevel = 0;
        const curTokenLine = curToken.line - 1;
        const curTokenCharPositionInLine = curToken.charPositionInLine;
        const curTokenPosition = Position.create(curTokenLine, curTokenCharPositionInLine);
        if (!ctx.document.class) {
            return
        }

        const docContent = ctx.document.class
        if (!docContent) {
            return;
        }



        this.setCtxIndent(ctx, docContent, curTokenPosition);

    }

    setCtxIndent(ctx: FormatContext, content: IContent | undefined, position: Position) {
        if (!content) {
            return;
        }
        // Not in the content range, jump to next
        if (!(position.line >= content.range.start.line && position.line <= content.range.end.line)) {
            if (content.next) {
                content.next._outerContent = content;
                this.setCtxIndent(ctx, content.next, position);
            }
            // class symbol is special,
            // if a content is not in class 'range', it might be in class 'children' property
            // because class 'range' only contains the class definition parts
            if (content instanceof UCClassSymbol) {
                if (content.children) {
                    this.setCtxIndent(ctx, content.children, position);
                }
            }
            return;
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

                && typeof entry[1] == "object"
                && (entry[1] as Object).hasOwnProperty("range");
        }).map(entry => entry[1] as IContent)

        subContents = removeSamelineContent(content, subContents);

        for (let index = 0; index < subContents.length; index++) {
            const subContent = subContents[index];
            subContent._outerContent = content;
            this.setCtxIndent(ctx, subContent, position);
        }


        const outerContent = content._outerContent;

        if (content instanceof UCBlock) {
            ctx.indentLevel++;
            const statements = removeSamelineContent(content, content.statements)
            for (let index = 0; index < statements.length; index++) {
                const statement = statements[index];
                (statement as IContent)._outerContent = content;
                this.setCtxIndent(ctx, statement, position);
            }
        }


        // add indent for class definition in different line
        if (content instanceof UCClassSymbol) {
            if (position.line != content.range.start.line) {
                ctx.indentLevel++;
            }
        }

        // add indent for local variable in 'function'
        if (content instanceof UCPropertySymbol) {
            if (content.outer instanceof UCMethodSymbol) {
                // skip function paramter in the same line
                if (content.range.start.line != content.outer.range.start.line) {
                    ctx.indentLevel++;
                }
            }
        }


        if (!isStatement(content as any)) {
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
        while (!(outerContent instanceof UCExpressionStatement)){
            outerContent = outerContent._outerContent;
            if (!outerContent) {
                return undefined;
            }
        }
        return outerContent;
    }

}

interface IContent {
    range: Range
    next?: IContent
    _outerContent?: IContent
}

function removeSamelineContent(content: IContent, subContents: (IContent | undefined)[]): IContent[] {
    // return subContents as any;
    const contentLineSet = new Set<number>();
    // const contentClassSet = new Set<Object>();
    if(content.range.start.line == content.range.end.line){
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
