/**
 * Representação mínima do DOM usada pela NexaPDF.
 * É intencionalmente pequena: o HTML é tratado como documento estático.
 */

export const NodeType = Object.freeze({
  DOCUMENT: 'document',
  ELEMENT: 'element',
  TEXT: 'text',
  COMMENT: 'comment',
} as const);

export type NodeTypeName = (typeof NodeType)[keyof typeof NodeType];

export type ChildNode = ElementNode | TextNode | CommentNode;
export type ParentNode = ElementNode | DocumentNode;

abstract class BaseNode {
  abstract readonly type: NodeTypeName;
  parent: ParentNode | null = null;
  children: ChildNode[] = [];

  appendChild<T extends ChildNode>(this: ParentNode, child: T): T {
    if (child.parent) child.parent.removeChild(child);
    child.parent = this;
    this.children.push(child);
    return child;
  }

  removeChild<T extends ChildNode>(child: T): T {
    const i = this.children.indexOf(child);
    if (i >= 0) {
      this.children.splice(i, 1);
      child.parent = null;
    }
    return child;
  }

  get textContent(): string {
    let out = '';
    for (const c of this.children) {
      if (c.type === NodeType.TEXT) out += c.data;
      else if (c.type === NodeType.ELEMENT) out += c.textContent;
    }
    return out;
  }

  /** Busca em profundidade o primeiro descendente com a tag informada. */
  find(tagName: string): ElementNode | null {
    for (const c of this.children) {
      if (c.type !== NodeType.ELEMENT) continue;
      if (c.tagName === tagName) return c;
      const r = c.find(tagName);
      if (r) return r;
    }
    return null;
  }

  /** Todos os descendentes com a tag informada, em ordem de documento. */
  findAll(tagName: string, out: ElementNode[] = []): ElementNode[] {
    for (const c of this.children) {
      if (c.type !== NodeType.ELEMENT) continue;
      if (c.tagName === tagName) out.push(c);
      c.findAll(tagName, out);
    }
    return out;
  }
}

export class ElementNode extends BaseNode {
  readonly type = NodeType.ELEMENT;
  readonly tagName: string;
  readonly attributes: Map<string, string>;
  private _classList: string[] | null = null;

  /** @param tagName nome em minúsculas */
  constructor(tagName: string, attributes: Map<string, string> = new Map()) {
    super();
    this.tagName = tagName;
    this.attributes = attributes;
  }

  getAttribute(name: string): string | null {
    const v = this.attributes.get(name);
    return v === undefined ? null : v;
  }

  hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }

  setAttribute(name: string, value: string | number): void {
    this.attributes.set(name, String(value));
    if (name === 'class') this._classList = null;
  }

  get id(): string {
    return this.attributes.get('id') ?? '';
  }

  get classList(): readonly string[] {
    if (!this._classList) {
      const raw = this.attributes.get('class') ?? '';
      this._classList = raw.split(/[\t\n\f\r ]+/).filter(Boolean);
    }
    return this._classList;
  }

  get elementChildren(): ElementNode[] {
    return this.children.filter((c): c is ElementNode => c.type === NodeType.ELEMENT);
  }
}

export class TextNode extends BaseNode {
  readonly type = NodeType.TEXT;
  data: string;

  constructor(data: string) {
    super();
    this.data = data;
  }
}

export class CommentNode extends BaseNode {
  readonly type = NodeType.COMMENT;
  data: string;

  constructor(data: string) {
    super();
    this.data = data;
  }
}

export class DocumentNode extends BaseNode {
  readonly type = NodeType.DOCUMENT;
  doctype: string | null = null;

  get documentElement(): ElementNode | null {
    return this.children.find((c): c is ElementNode => c.type === NodeType.ELEMENT) ?? null;
  }

  get head(): ElementNode | null {
    return this.documentElement?.elementChildren.find((c) => c.tagName === 'head') ?? null;
  }

  get body(): ElementNode | null {
    return this.documentElement?.elementChildren.find((c) => c.tagName === 'body') ?? null;
  }
}
