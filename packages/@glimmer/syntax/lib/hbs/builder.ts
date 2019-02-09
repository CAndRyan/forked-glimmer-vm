import { keys } from '@glimmer/util';
import * as hbs from '../types/handlebars-ast';

const NO_STRIP: hbs.StripFlags = { open: false, close: false };

export class AstBuilder {
  private pos = 0;

  build(program: BuilderAst): hbs.AnyProgram {
    let statements: hbs.Statement[] = [];

    return this.spanned(() => {
      for (let statement of program.body) {
        statements.push(this.visit(statement));
      }

      return span => ({
        type: 'Program',
        span,
        body: statements,
      });
    });
  }

  visit(statement: Statement): hbs.Statement {
    switch (statement.type) {
      case 'ContentStatement':
        let span = this.consume(statement.value);

        return {
          type: 'ContentStatement',
          span,
          value: statement.value,
          strip: { open: false, close: false },
        };

      case 'ContentMustache': {
        return this.spanned(() => {
          this.consume('{{');
          let value = this.expr(statement.value);
          this.consume('}}');

          return span => ({
            type: 'MustacheContent',
            span,
            value,
          });
        });
      }

      case 'BlockStatement':
        return this.spanned(() => {
          this.consume('{{#');
          let path = this.path(statement.call);
          let params: hbs.Expression[] = [];
          let hash: hbs.Hash | null = null;

          if (statement.params.length) {
            this.consume(' ');
            params = this.exprs(statement.params);
          }

          if (statement.hash) {
            this.consume(' ');
            hash = this.hash(statement.hash);
          }

          let program = this.program(statement.program);

          let inverse: hbs.Program | null = null;
          if (statement.inverse) {
            this.consume('{{else}}');
            inverse = this.program(statement.inverse);
          }

          this.consume('{{/');
          debugger;
          this.consume(pathString(statement.call));
          this.consume('}}');

          return span => ({
            type: 'BlockStatement',
            chained: false,
            span,
            call: path,
            params,
            hash,
            program,
            inverse,
            openStrip: NO_STRIP,
            inverseStrip: NO_STRIP,
            closeStrip: NO_STRIP,
          });
        });

      case 'MustacheStatement':
        return this.spanned(() => {
          this.consume('{{');
          let call = this.expr(statement.call);
          let params = this.exprs(statement.params);
          let hash = this.hash(statement.hash);
          this.consume('}}');

          return span => ({
            type: 'MustacheStatement',
            span,
            call,
            params,
            hash,
            trusted: false,
            strip: NO_STRIP,
          });
        });

      default:
        throw new Error(`unimplemented ${statement.type} for AST builder`);
    }
  }

  program(program: Program): hbs.Program {
    if (program.blockParams) {
      this.consume(' as |');
      this.consume(program.blockParams.join(' '));
      this.consume('|}}');
    } else {
      this.consume('}}');
    }

    return this.spanned(() => {
      let body = program.body.map(s => this.visit(s));

      return span => ({
        type: 'Program',
        span,
        body,
        blockParams: program.blockParams,
      });
    });
  }

  path(expression: PathExpression): hbs.PathExpression {
    return this.spanned(() => {
      let head = this.var(expression.head);
      let tail = this.segments(expression.tail);

      return span => ({ type: 'PathExpression', span, head, tail });
    });
  }

  expr(expression: Expression): hbs.Expression {
    switch (expression.type) {
      case 'BooleanLiteral':
        return this.spanned(() => {
          this.consume(String(expression.value));

          return span => ({ type: 'BooleanLiteral', span, value: expression.value });
        });

      case 'NumberLiteral':
        return this.spanned(() => {
          this.consume(String(expression.value));

          return span => ({ type: 'NumberLiteral', span, value: expression.value });
        });

      case 'StringLiteral':
        return this.spanned(() => {
          this.consume(JSON.stringify(expression.value));

          return span => ({ type: 'StringLiteral', span, value: expression.value });
        });

      case 'PathExpression':
        return this.path(expression);

      default:
        throw new Error(`unimplemented ${expression.type}`);
    }
  }

  var(item: Head): hbs.Head {
    return this.spanned<hbs.Head>(() => {
      if (item.type === 'LocalReference') {
        this.consume(item.name);
        return span => ({ type: 'LocalReference', span, name: item.name });
      } else if (item.type === 'This') {
        this.consume('this');
        return span => ({ type: 'This', span });
      } else {
        this.consume('@');
        this.consume(item.name);
        return span => ({ type: 'ArgReference', span, name: item.name });
      }
    });
  }

  segments(items: string[] | null): hbs.PathSegment[] | null {
    if (items === null) return null;

    return items.map(item => {
      this.consume('.');
      return this.spanned(() => {
        this.consume(item);
        return span => ({ type: 'PathSegment', span, name: item });
      });
    });
  }

  exprs(params: Expression[]): hbs.Expression[] {
    return params.map(p => this.expr(p));
  }

  hash(hash: Hash | null): hbs.Hash | null {
    if (hash === null) return null;

    return this.spanned(() => {
      let out: hbs.HashPair[] = [];
      for (let pair of hash.pairs) {
        out.push(this.hashPair(pair));
      }

      return span => ({
        span,
        pairs: out,
      });
    });
  }

  hashPair(pair: HashPair): hbs.HashPair {
    return this.spanned(() => {
      return span => ({
        span,
        key: pair.key,
        value: this.expr(pair.value),
      });
    });
  }

  consume(chars: string): hbs.Span {
    let pos = this.pos;
    this.pos += chars.length;
    return { start: pos, end: this.pos };
  }

  spanned<T extends hbs.AnyNode>(cb: () => (span: hbs.Span) => T): T {
    let pos = this.pos;

    let next = cb();
    return next({ start: pos, end: this.pos });
  }
}

export interface BuilderAst {
  type: 'Program';
  body: Statement[];
}

export function ast(...statements: Statement[]): BuilderAst {
  return {
    type: 'Program',
    body: statements,
  };
}

export interface Program {
  type: 'Program';
  body: Statement[];
  blockParams: string[];
}

export function block({ statements, as }: { statements: Statement[]; as: string[] }): Program {
  return {
    type: 'Program',
    body: statements,
    blockParams: as,
  };
}

export type Statement =
  | MustacheStatement
  | ContentMustache
  | BlockStatement
  | ContentStatement
  | CommentStatement;

export interface CommonMustache {
  call: Expression;
  params: Expression[];
  hash: Hash | null;
  trusted: boolean;
  strip?: StripFlags;
}

export interface MustacheStatement extends CommonMustache, MustacheBody {
  type: 'MustacheStatement';
}

export interface ContentMustache {
  type: 'ContentMustache';
  value: Expression;
}

export function mustache(
  call: Expression,
  params?: Expression[],
  hashObject?: { [key: string]: Expression }
): MustacheStatement | ContentMustache {
  if (params !== undefined || hashObject !== undefined) {
    return {
      type: 'MustacheStatement',
      call,
      params: params || [],
      hash: hashObject ? hash(hashObject) : null,
      trusted: false,
    };
  } else {
    return {
      type: 'ContentMustache',
      value: call,
    };
  }
}

export interface MustacheBody {
  call: Expression;
  params: Expression[];
  hash: Hash | null;
}

export interface CommonBlock extends MustacheBody {
  call: PathExpression;
  params: Expression[];
  hash: Hash | null;
  program: Program;
  inverse: Program | null;
  openStrip?: StripFlags;
  inverseStrip?: StripFlags;
  closeStrip?: StripFlags;
}

export interface BlockStatement extends CommonBlock {
  type: 'BlockStatement';
}

export function blockCall(
  path: PathExpression,
  {
    params,
    hash,
    program,
    inverse,
  }: { params?: Expression[]; hash?: Hash; program: Program; inverse?: Program }
): BlockStatement {
  return {
    type: 'BlockStatement',
    call: path,
    params: params || [],
    hash: hash || null,
    program,
    inverse: inverse || null,
  };
}

export interface ContentStatement {
  type: 'ContentStatement';
  value: string;
}

export function content(value: string): ContentStatement {
  return {
    type: 'ContentStatement',
    value,
  };
}

export interface CommentStatement {
  type: 'CommentStatement';
  value: string;
}

export function comment(value: string): CommentStatement {
  return {
    type: 'CommentStatement',
    value,
  };
}

export type Expression = SubExpression | PathExpression | Literal;

export interface SubExpression extends MustacheBody {
  type: 'SubExpression';
  call: Expression;
  params: Expression[];
  hash: Hash | null;
}

export function sexpr(
  path: Expression,
  { params, hash }: { params?: Expression[]; hash?: Hash }
): SubExpression {
  return {
    type: 'SubExpression',
    call: path,
    params: params || [],
    hash: hash || null,
  };
}

export interface PathExpression {
  type: 'PathExpression';
  head: LocalReference | ArgReference | This;
  tail: string[] | null;
}

function pathString(expr: PathExpression) {
  let out = ``;

  switch (expr.head.type) {
    case 'ArgReference':
      out += `@${expr.head.name}`;
      break;
    case 'LocalReference':
      out += expr.head.name;
      break;
    case 'This':
      out += 'this';
      break;
  }

  out += expr.tail ? expr.tail.join('.') : '';

  return out;
}

export function path(path: string): PathExpression {
  let parts = path.split('.');

  let head: Head;
  let first = parts.shift()!;

  if (path[0] === '@') {
    head = { type: 'ArgReference', name: first.slice(1) };
  } else if (first === 'this') {
    head = { type: 'This' };
  } else {
    head = { type: 'LocalReference', name: first };
  }

  return {
    type: 'PathExpression',
    head,
    tail: parts.length ? parts : null,
  };
}

export function atPath(path: string): PathExpression {
  let parts = path.split('.');
  return {
    type: 'PathExpression',
    head: {
      type: 'ArgReference',
      name: parts[0],
    },
    tail: parts.length > 1 ? parts.slice(1) : null,
  };
}

export interface LocalReference {
  type: 'LocalReference';
  name: string;
}

export interface ArgReference {
  type: 'ArgReference';
  name: string;
}

export interface This {
  type: 'This';
}

export type Head = LocalReference | ArgReference | This;

export type Literal =
  | StringLiteral
  | BooleanLiteral
  | NumberLiteral
  | UndefinedLiteral
  | NullLiteral;

export function literal(value: string | boolean | number | null | undefined): Literal {
  if (value === null) {
    return { type: 'NullLiteral', value: null };
  } else if (value === undefined) {
    return { type: 'UndefinedLiteral', value: undefined };
  } else {
    switch (typeof value) {
      case 'string':
        return { type: 'StringLiteral', value };
      case 'boolean':
        return { type: 'BooleanLiteral', value };
      case 'number':
        return { type: 'NumberLiteral', value };
      default:
        throw new Error(`Unexhausted ${value}`);
    }
  }
}

export interface StringLiteral {
  type: 'StringLiteral';
  value: string;
}

export interface BooleanLiteral {
  type: 'BooleanLiteral';
  value: boolean;
}

export interface NumberLiteral {
  type: 'NumberLiteral';
  value: number;
}

export interface UndefinedLiteral {
  type: 'UndefinedLiteral';
  value: undefined;
}

export interface NullLiteral {
  type: 'NullLiteral';
  value: null;
}

export interface Hash {
  pairs: HashPair[];
}

export function hash(map: { [key: string]: Expression }): Hash {
  let out: HashPair[] = [];

  for (let key of keys(map)) {
    out.push({ key: key as string, value: map[key] });
  }

  return { pairs: out };
}

export interface HashPair {
  key: string;
  value: Expression;
}

export interface StripFlags {
  open: boolean;
  close: boolean;
}