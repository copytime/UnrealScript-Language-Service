import { ParserRuleContext } from 'antlr4ts';
import { ParseTree } from 'antlr4ts/tree/ParseTree';
import { RuleNode } from 'antlr4ts/tree/RuleNode';
import { TerminalNode } from 'antlr4ts/tree/TerminalNode';
import { ErrorNode } from 'antlr4ts/tree/ErrorNode';

import { UCGrammarVisitor } from '../antlr/UCGrammarVisitor';
import { StatementContext, IfStatementContext, CodeBlockOptionalContext, ReplicationStatementContext, WhileStatementContext, ReturnStatementContext, GotoStatementContext, ElseStatementContext, DoStatementContext, SwitchStatementContext, ForStatementContext, ForeachStatementContext, LabeledStatementContext, AssertStatementContext, CaseClauseContext, DefaultClauseContext, ExpressionContext } from '../antlr/UCGrammarParser';

import { rangeFromBounds } from './helpers';

import { UCExpressionStatement, UCIfStatement, UCDoUntilStatement, UCWhileStatement, UCSwitchStatement, UCCaseClause, UCForStatement, UCForEachStatement, UCLabeledStatement, IStatement, UCReturnStatement, UCGotoStatement, UCAssertStatement, UCBlock, UCDefaultClause } from './statements';
import { ExpressionVisitor } from './expressionWalker';

export class StatementWalker implements UCGrammarVisitor<IStatement> {
	visit(tree: ParseTree): IStatement {
		return undefined!;
	}

	visitChildren(node: RuleNode): IStatement {
		return undefined!;
	}

	visitTerminal(node: TerminalNode): IStatement {
		return undefined!;
	}

	visitErrorNode(node: ErrorNode): IStatement {
		return undefined!;
	}

	visitStatement(ctx: StatementContext) {
		if (ctx.childCount === 0) {
			return undefined!;
		}

		return ctx.getChild(0).accept(this);
	}

	visitExpression(ctx: ExpressionContext) {
		const statement = new UCExpressionStatement(rangeFromBounds(ctx.start, ctx.stop));
		statement.context = ctx;
		statement.expression = ctx.accept(ExpressionVisitor);
		return statement;
	}

	visitLabeledStatement(ctx: LabeledStatementContext): UCLabeledStatement {
		const statement = new UCLabeledStatement(rangeFromBounds(ctx.start, ctx.stop));
		const idNode = ctx.identifier();
		if (idNode) {
			statement.label = idNode.text;
		}
		statement.context = ctx;
		return statement;
	}

	visitReturnStatement(ctx: ReturnStatementContext): IStatement {
		const statement = new UCReturnStatement(rangeFromBounds(ctx.start, ctx.stop));
		statement.context = ctx;

		const exprNode = ctx.expression();
		if (exprNode) {
			statement.expression = exprNode.accept(ExpressionVisitor);
		}
		return statement;
	}

	visitGotoStatement(ctx: GotoStatementContext): IStatement {
		const statement = new UCGotoStatement(rangeFromBounds(ctx.start, ctx.stop));
		statement.context = ctx;

		const idNode = ctx.identifier();
		if (idNode) {
			statement.label = idNode.text;
		} else {
			const exprNode = ctx.expression();
			if (exprNode) {
				statement.expression = exprNode.accept(ExpressionVisitor);
			}
		}
		return statement;
	}

	visitReplicationStatement(ctx: ReplicationStatementContext): UCIfStatement {
		const statement = new UCIfStatement(rangeFromBounds(ctx.start, ctx.stop));
		statement.context = ctx;

		const exprNode = ctx.expression();
		if (exprNode) {
			statement.expression = exprNode.accept(ExpressionVisitor);
		}
		return statement;
	}

	visitWhileStatement(ctx: WhileStatementContext): UCWhileStatement {
		const statement = new UCWhileStatement(rangeFromBounds(ctx.start, ctx.stop));
		statement.context = ctx;

		const exprNode = ctx.expression();
		if (exprNode) {
			statement.expression = exprNode.accept(ExpressionVisitor);
		}

		const blockNode = ctx.codeBlockOptional();
		if (blockNode) {
			statement.then = blockNode.accept(this);
		}
		return statement;
	}

	visitIfStatement(ctx: IfStatementContext): UCIfStatement {
		const statement = new UCIfStatement(rangeFromBounds(ctx.start, ctx.stop));
		statement.context = ctx;

		const exprNode = ctx.expression();
		if (exprNode) {
			statement.expression = exprNode.accept(ExpressionVisitor);
		}

		const blockNode = ctx.codeBlockOptional();
		if (blockNode) {
			statement.then = blockNode.accept(this);
		}

		const elseStatementNode = ctx.elseStatement();
		if (elseStatementNode) {
			statement.else = elseStatementNode.accept(this);
		}
		return statement;
	}

	visitElseStatement(ctx: ElseStatementContext) {
		const blockNode = ctx.codeBlockOptional();
		if (blockNode) {
			return blockNode.accept(this);
		}
		return undefined;
	}

	visitDoStatement(ctx: DoStatementContext): UCDoUntilStatement {
		const statement = new UCDoUntilStatement(rangeFromBounds(ctx.start, ctx.stop));
		statement.context = ctx;

		const exprNode = ctx.expression();
		if (exprNode) {
			statement.expression = exprNode.accept(ExpressionVisitor);
		}

		const blockNode = ctx.codeBlockOptional();
		if (blockNode) {
			statement.then = blockNode.accept(this);
		}
		return statement;
	}

	visitForeachStatement(ctx: ForeachStatementContext): UCForEachStatement {
		const statement = new UCForEachStatement(rangeFromBounds(ctx.start, ctx.stop));
		statement.context = ctx;

		const exprNode = ctx.primaryExpression();
		if (exprNode) {
			statement.expression = exprNode.accept(ExpressionVisitor);
		}

		const blockNode = ctx.codeBlockOptional();
		if (blockNode) {
			statement.then = blockNode.accept(this);
		}
		return statement;
	}

	visitForStatement(ctx: ForStatementContext): UCForStatement {
		const statement = new UCForStatement(rangeFromBounds(ctx.start, ctx.stop));
		statement.context = ctx;

		let exprNode = ctx.expression(0);
		if (exprNode) {
			statement.init = exprNode.accept(ExpressionVisitor);
		}

		exprNode = ctx.expression(1);
		if (exprNode) {
			statement.expression = exprNode.accept(ExpressionVisitor);
		}

		exprNode = ctx.expression(2);
		if (exprNode) {
			statement.next = exprNode.accept(ExpressionVisitor);
		}

		const blockNode = ctx.codeBlockOptional();
		if (blockNode) {
			statement.then = blockNode.accept(this);
		}
		return statement;
	}

	visitSwitchStatement(ctx: SwitchStatementContext): IStatement {
		const statement = new UCSwitchStatement(rangeFromBounds(ctx.start, ctx.stop));
		statement.context = ctx;

		const exprNode = ctx.expression();
		if (exprNode) {
			statement.expression = exprNode.accept(ExpressionVisitor);
		}

		const clauseNodes: ParserRuleContext[] = ctx.caseClause() || [];
		const defaultClauseNode = ctx.defaultClause();

		if (defaultClauseNode) {
			clauseNodes.push(defaultClauseNode);
		}

		const block = new UCBlock(rangeFromBounds(ctx.start, ctx.stop));
		block.statements = Array(clauseNodes.length);
		for (var i = 0; i < clauseNodes.length; ++ i) {
			const caseStatement = clauseNodes[i].accept(this);
			block.statements[i] = caseStatement;
		}
		statement.then = block;

		return statement;
	}

	visitCaseClause(ctx: CaseClauseContext): IStatement {
		const statement = new UCCaseClause(rangeFromBounds(ctx.start, ctx.stop));
		statement.context = ctx;

		const exprNode = ctx.expression();
		if (exprNode) {
			statement.expression = exprNode.accept(ExpressionVisitor);
		}
		statement.then = this.visitCodeBlockOptional(ctx);
		return statement;
	}

	visitDefaultClause(ctx: DefaultClauseContext) {
		const statement = new UCDefaultClause(rangeFromBounds(ctx.start, ctx.stop));
		statement.context = ctx;
		statement.then = this.visitCodeBlockOptional(ctx);
		return statement;
	}

	visitAssertStatement(ctx: AssertStatementContext): IStatement {
		const statement = new UCAssertStatement(rangeFromBounds(ctx.start, ctx.stop));
		statement.context = ctx;

		const exprNode = ctx.expression();
		if (exprNode) {
			statement.expression = exprNode.accept(ExpressionVisitor);
		}
		return statement;
	}

	visitCodeBlockOptional(ctx: CodeBlockOptionalContext|CaseClauseContext|DefaultClauseContext): UCBlock {
		const block = new UCBlock(rangeFromBounds(ctx.start, ctx.stop));
		const statementNodes = ctx.statement();
		if (statementNodes) {
			block.statements = new Array(statementNodes.length);
			for (var i = 0; i < statementNodes.length; ++ i) {
				const statement = statementNodes[i].accept(this);
				block.statements[i] = statement;
			}
		}
		return block;
	}
}

export const StatementVisitor = new StatementWalker();