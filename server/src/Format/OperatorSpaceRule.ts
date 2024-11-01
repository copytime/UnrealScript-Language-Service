import { Token } from 'antlr4ts';
import { FormatContext, IFormatInfo, IFormatRule } from 'documentFormater';
import { UCParser } from 'UC/antlr/generated/UCParser';


export class OperatorSpaceRule implements IFormatRule {


    prevLine = -1;

    Format(ctx: FormatContext, currentToken: Token): IFormatInfo[] {
        const res: IFormatInfo[] = [];
        let indentLevel = ctx.indentLevel;

        if (this.isOperatorToken(currentToken)) {
            //left hand token
            const leftHandToken = this.findSameLineToken(ctx.tryGetPrevToken.bind(ctx), currentToken);
            if (leftHandToken.token && leftHandToken.token.type != UCParser.OPEN_PARENS) {
                const expectedLength = this.getExpectedLength(ctx, currentToken, false, false);
                const actualLength = this.getWSLength(ctx.formatOption.tabSize, leftHandToken.wsToken);
                if (expectedLength != actualLength) {
                    const fixedText = " ".repeat(expectedLength);
                    res.push({
                        line: currentToken.line - 1,
                        position: leftHandToken.wsToken?.charPositionInLine ?? currentToken.charPositionInLine,
                        length: leftHandToken.wsToken ?
                            (leftHandToken.wsToken.stopIndex - leftHandToken.wsToken.startIndex + 1)
                            :
                            0,
                        fixedText: fixedText
                    })
                }
            }

            //right hand token
            const rightHandToken = this.findSameLineToken(ctx.tryGetNextToken.bind(ctx), currentToken);
            if (rightHandToken.token) {
                const isPrefixOperator = this.isPrefixOperator(leftHandToken.token, currentToken, rightHandToken.token);
                const expectedLength = this.getExpectedLength(ctx, currentToken, isPrefixOperator, true);
                const actualLength = this.getWSLength(ctx.formatOption.tabSize, rightHandToken.wsToken);
                if (expectedLength != actualLength) {
                    const fixedText = " ".repeat(expectedLength);
                    res.push({
                        line: currentToken.line - 1,
                        position: rightHandToken.wsToken?.charPositionInLine ??
                            currentToken.charPositionInLine + (currentToken.stopIndex - currentToken.startIndex + 1),
                        length: rightHandToken.wsToken ?
                            (rightHandToken.wsToken.stopIndex - rightHandToken.wsToken.startIndex + 1)
                            :
                            0,
                        fixedText: fixedText
                    })
                }
            }



        }

        this.prevLine = currentToken.line;
        return res;
    }


    isOperatorToken(currentToken: Token) {
        const type = currentToken.type;
        if (type == UCParser.STAR
            || type == UCParser.DIV
            || type == UCParser.MODULUS
            || type == UCParser.PLUS
            || type == UCParser.MINUS
            || type == UCParser.LSHIFT
            || type == UCParser.RSHIFT
            || type == UCParser.SHIFT
            || type == UCParser.DOLLAR
            || type == UCParser.AT
            || type == UCParser.SHARP
            || type == UCParser.COLON
            || type == UCParser.INTERR
            || type == UCParser.BANG
            || type == UCParser.AMP
            || type == UCParser.BITWISE_OR
            || type == UCParser.CARET
            || type == UCParser.INCR
            || type == UCParser.DECR
            || type == UCParser.TILDE
            || type == UCParser.EXP
            || type == UCParser.LT
            || type == UCParser.GT
            || type == UCParser.OR
            || type == UCParser.AND
            || type == UCParser.EQ
            || type == UCParser.NEQ
            || type == UCParser.GEQ
            || type == UCParser.LEQ
            || type == UCParser.IEQ
            || type == UCParser.MEQ
            || type == UCParser.ASSIGNMENT
            || type == UCParser.ASSIGNMENT_INCR
            || type == UCParser.ASSIGNMENT_DECR
            || type == UCParser.ASSIGNMENT_AT
            || type == UCParser.ASSIGNMENT_DOLLAR
            || type == UCParser.ASSIGNMENT_AND
            || type == UCParser.ASSIGNMENT_OR
            || type == UCParser.ASSIGNMENT_STAR
            || type == UCParser.ASSIGNMENT_CARET
            || type == UCParser.ASSIGNMENT_DIV
        ) {
            return true;
        }
        return false;
    }

    findSameLineToken(findFunc: (token: Token) => Token | undefined, currentToken: Token): { token: Token | undefined, wsToken: Token | undefined } {
        const prevOrNextToken = findFunc(currentToken);
        if (!prevOrNextToken) {
            return { token: undefined, wsToken: undefined };
        }
        if (prevOrNextToken.line != currentToken.line) {
            return { token: undefined, wsToken: undefined };
        }
        if (prevOrNextToken.type == UCParser.WS) {
            const innerRes = this.findSameLineToken(findFunc, prevOrNextToken);
            return { token: innerRes.token, wsToken: prevOrNextToken };
        }
        return { token: prevOrNextToken, wsToken: undefined };
    }

    getWSLength(tabSize: number, wsToken: Token | undefined): number {
        let count = 0;
        if (!wsToken) {
            return count;
        }
        const text = wsToken.text ?? ""
        for (let index = 0; index < text.length; index++) {
            const character = text[index];
            if (character === '\t') {
                count += tabSize;
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

    getExpectedLength(ctx: FormatContext, currentToken: Token, isPrefixOperator: boolean, isRight: boolean): 0 | 1 {
        if (ctx.isInDefaultPropertiesScope) {
            return 0;
        }
        if (currentToken.type == UCParser.DOLLAR    //$ string concat
            || currentToken.type == UCParser.AT     //@ string concat
            || currentToken.type == UCParser.INCR   //++ increment
            || currentToken.type == UCParser.DECR   //-- decrement
        ) {
            return 0;
        }
        if (isPrefixOperator) {
            return 0;
        }

        if (currentToken.type == UCParser.LT) {
            const prevTokenInfo = this.findSameLineToken(ctx.tryGetPrevToken.bind(ctx), currentToken);
            const prevToken = prevTokenInfo.token;

            if (prevToken?.type == UCParser.KW_ARRAY            // array<       e.g. array<int>
                || prevToken?.type == UCParser.KW_CLASS         // map<         e.g. map<int>
                || prevToken?.type == UCParser.KW_DELEGATE      // delegete<    e.g. delegete<int>
            ) {
                return 0;
            }
        }

        if (currentToken.type == UCParser.GT && !isRight) {
            //find prev matched <
            let prevMatchedLT: Token|undefined = currentToken;
            let level = 1;
            while (true) {
                const prevTokenInfo = this.findSameLineToken(ctx.tryGetPrevToken.bind(ctx), prevMatchedLT);
                prevMatchedLT = prevTokenInfo.token;
                if (!prevMatchedLT) {
                    break;
                }
                if (prevMatchedLT.type == UCParser.GT) {
                    level += 1;
                }
                if (prevMatchedLT.type == UCParser.LT) {
                    level -= 1;
                }
                if (level == 0) {
                    break;
                }
            }
            if (prevMatchedLT && prevMatchedLT.charPositionInLine != currentToken.charPositionInLine && prevMatchedLT.type == UCParser.LT) {
                const prevTokenInfo = this.findSameLineToken(ctx.tryGetPrevToken.bind(ctx), prevMatchedLT);
                const prevToken = prevTokenInfo.token;

                if (prevToken?.type == UCParser.KW_ARRAY            // array<       e.g. array<int>
                    || prevToken?.type == UCParser.KW_CLASS         // map<         e.g. map<int>
                    || prevToken?.type == UCParser.KW_DELEGATE      // delegete<    e.g. delegete<int>
                ) {
                    return 0;
                }
            }
        }
        return 1;
    }

    isPrefixOperator(prev: Token | undefined, currentToken: Token, next: Token) {
        if (currentToken.type != UCParser.BANG && currentToken.type != UCParser.MINUS) {
            return false;
        }
        if (!this.canOperatorBeAppliedTo(next, true)) {
            return false;
        }
        if (this.canOperatorBeAppliedTo(prev, false)) {
            return false;
        }
        return true;
    }

    canOperatorBeAppliedTo(token: Token | undefined, isRight: boolean) {
        if (!token) {
            return false;
        }
        switch (token.type) {
            case UCParser.ID:
            case UCParser.BOOLEAN_LITERAL:
            case UCParser.INTEGER_LITERAL:
            case UCParser.DECIMAL_LITERAL:
            case UCParser.STRING_LITERAL:
            case UCParser.NAME_LITERAL:
                return true;
            case UCParser.OPEN_PARENS:
                return isRight;     // "(-"❌    "-("✔️
            case UCParser.CLOSE_PARENS:
                return !isRight;    // "-)"❌    ")-"✔️
            default:
                return false;
        }
    }
}