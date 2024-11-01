import { Token } from 'antlr4ts/Token';
import { UCParser } from 'UC/antlr/generated/UCParser';

export function isOperatorToken(currentToken: Token) {
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