import { Token } from 'antlr4ts';
import { FormatContext, IFormatInfo, IFormatRule } from 'documentFormater';
import { UCParser } from 'UC/antlr/generated/UCParser';

export class BraceNewlineRule implements IFormatRule {

    prevToken: Token | undefined = undefined;
    prevLine = -1;

    Format(ctx: FormatContext, currentToken: Token): IFormatInfo[] {
        const res: IFormatInfo[] = [];

        let addNewline = false;
        let indentLevel = ctx.indentLevel;

        if (currentToken.line == this.prevLine) {
            if (currentToken.type == UCParser.OPEN_BRACE) {
                //add new line before '{'
                addNewline = true;
            }
            if (this.prevToken && this.prevToken.type == UCParser.OPEN_BRACE && currentToken.type != UCParser.NEWLINE) {
                //add new line after '{'
                addNewline = true;
                indentLevel += 1;

            }
            if (currentToken.type == UCParser.CLOSE_BRACE) {
                //add new line before '}'
                addNewline = true;
                indentLevel = indentLevel - 1 >= 0 ? indentLevel - 1 : 0;
            }
            if (this.prevToken
                && this.prevToken.type == UCParser.CLOSE_BRACE
                && currentToken.type != UCParser.NEWLINE
                && currentToken.type != UCParser.WS
                && currentToken.type != UCParser.SEMICOLON
                && currentToken.type != UCParser.CLOSE_BRACE
                && currentToken.type != UCParser.KW_UNTIL
            ) {
                //add new line after '}'
                addNewline = true;
            }
        }


        if (addNewline) {
            res.push({
                line: currentToken.line - 1,
                position: currentToken.charPositionInLine,
                length: 0,
                fixedText: "\n" + ctx.indextString.repeat(indentLevel)
            });
        }

        if (currentToken.type != UCParser.WS) {
            // skip 'WS' because we need prev token to check if it is '{' or '}'
            // anything after '{' or '}' should trigger addNewline true.

            // 'WS' will affect this condition: "{ foobar"
            //                                    ^-----------'WS' in here
            //
            // if we dont skip 'WS', prev token will be 'WS' and 'foobar' will not trigger addNewline

            this.prevToken = currentToken;


            // 'WS' will affect this condition:
            // "    if(bbb) "
            // "    {       "
            //  ^--^-------'WS' in here
            // if we count this as a new line, it will apply add new line before '{' rule
            // eventually we will get another new line which we dont want
            // "    if(bbb) "
            // "            "   <--------- wrong new line
            // "    {       "
            this.prevLine = currentToken.line;
        }

        return res;
    }
}