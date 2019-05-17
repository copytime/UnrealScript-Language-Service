lexer grammar UCLexer;

fragment DIGIT: [0-9];
fragment DIGITF: [0-9fF];
fragment EXPONENT: ('e' | 'E') ('+' | '-')? DIGIT+;
fragment HEX_DIGIT: (DIGIT | 'a' ..'f' | 'A' ..'F');
fragment ESC_SEQ: '\\' ('b' | 't' | 'n' | 'r' | '"' | '\'' | '\\');

LINE_COMMENT
	: '//' ~[\r\n]*
	-> channel(HIDDEN)
	;

BLOCK_COMMENT
	: '/*' .*? '*/'
	-> channel(HIDDEN)
	;

EOL
	: '\n'
	-> channel(HIDDEN)
	;
WS
	: [ \t\r\n]+
	-> skip
	;

STRING: '"' (~["\\] | ESC_SEQ)* '"';
NAME: '\'' (~['\\] | ESC_SEQ)* '\'';
ID:	[a-zA-Z_][a-zA-Z0-9_]*;
// ID:	[a-z_][a-z0-9_]*;

ESCAPE: '\\';

INTEGER
	: (DIGIT 'x' HEX_DIGIT+)
	| (DIGIT+ ('f'| 'F')*)
	;

FLOAT
	: (DIGIT+ DOT DIGITF* EXPONENT?)
	| (DIGIT+ DIGITF* EXPONENT)
	;

OPEN_PARENS: '(';
CLOSE_PARENS: ')';

OPEN_BRACE: '{';
CLOSE_BRACE: '}';

OPEN_BRACKET: '[';
CLOSE_BRACKET: ']';

SEMICOLON: ';';
COMMA: ',';

COLON: ':';
INTERR: '?';

SQUOT: '\'';

SHARP: '#';
PLUS: '+';
MINUS: '-';
DOT: '.';
AT: '@';
DOLLAR: '$';
BANG: '!';
AMP: '&';
BITWISE_OR: '|';
STAR: '*';
CARET: '^';
DIV: '/';
PERCENT: '%';
TILDE: '~';

LT: '<';
GT: '>';
OR: '||';
AND: '&&';
EQ: '==';
NEQ: '!=';
GEQ: '>=';
LEQ: '<=';
IEQ: '~=';
MEQ: '^^';

INCR: '++';
DECR: '--';
EXP: '**';
LSHIFT: '<<';
SHIFT: '>>>';

ASSIGNMENT: '=';
ASSIGNMENT_INCR: '+=';
ASSIGNMENT_DECR: '-=';
ASSIGNMENT_AT: '@=';
ASSIGNMENT_DOLLAR: '$=';
ASSIGNMENT_AND: '&=';
ASSIGNMENT_OR: '|=';
ASSIGNMENT_STAR: '*=';
ASSIGNMENT_CARET: '^=';
ASSIGNMENT_DIV: '/=';