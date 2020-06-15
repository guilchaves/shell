// @ts-ignore
const Me = imports.misc.extensionUtils.getCurrentExtension();

import * as Ecs from 'ecs';

import type { Forest } from './forest';
import type { Entity } from 'ecs';
import type { Ext } from 'extension';
import type { Rectangle } from 'rectangle';

import * as Stack from 'stack';

/** A node is either a fork a window */
export enum NodeKind {
    FORK = 1,
    WINDOW = 2,
    STACK = 3,
}

/** Fetch the string representation of this value */
function node_variant_as_string(value: NodeKind): string {
    return value == NodeKind.FORK ? "NodeVariant::Fork" : "NodeVariant::Window";
}

/** Identifies this node as a fork */
export interface NodeFork {
    kind: 1;
    entity: Entity;
}

/** Identifies this node as a window */
export interface NodeWindow {
    kind: 2;
    entity: Entity;
}

export interface NodeStack {
    kind: 3;
    entities: Array<Entity>;
    container: Stack.Stack;
    rect: Rectangle | null;
}

export function stack_move_left(stack: NodeStack, entity: Entity): boolean {
    let moved = false;
    let idx = 0;
    for (const cmp of stack.entities) {
        if (Ecs.entity_eq(cmp, entity)) {
            if (idx === 0) {
                stack.entities.splice(idx, 1);
                stack.container.windows[idx].button.destroy();
                stack.container.windows.splice(idx, 1);
                moved = false;
            } else {
                const tmp = stack.entities[idx - 1];
                stack.entities[idx - 1] = entity;
                stack.entities[idx] = tmp;
                moved = true;
            }
            break
        }

        idx += 1;
    }

    return moved;
}

export function stack_move_right(stack: NodeStack, entity: Entity): boolean {
    let moved = false;
    let idx = 0;
    const max = stack.entities.length - 1;
    for (const cmp of stack.entities) {
        if (Ecs.entity_eq(cmp, entity)) {
            if (idx === max) {
                stack.entities.splice(idx, 1);
                stack.container.windows[idx].button.destroy();
                stack.container.windows.splice(idx, 1);
                moved = false;
            } else {
                const tmp = stack.entities[idx + 1];
                stack.entities[idx + 1] = entity;
                stack.entities[idx] = tmp;
                moved = true;
            }
            break
        }

        idx += 1;
    }

    return moved;
}

export function stack_remove(stack: NodeStack, entity: Entity) {
    let idx = 0;

    for (const cmp of stack.entities) {
        if (Ecs.entity_eq(cmp, entity)) {
            stack.entities.splice(idx, 1);
            stack.container.windows[idx].button.destroy();
            stack.container.windows.splice(idx, 1);
            return;
        }
        idx += 1;
    }
}

export type NodeADT = NodeFork | NodeWindow | NodeStack;

/** A tiling node may either refer to a window entity, or another fork entity */
export class Node {
    /** The actual data for this node */
    inner: NodeADT;

    constructor(inner: NodeADT) {
        this.inner = inner;
    }

    /** Create a fork variant of a `Node` */
    static fork(entity: Entity): Node {
        return new Node({ kind: NodeKind.FORK, entity });
    }

    /** Create the window variant of a `Node` */
    static window(entity: Entity): Node {
        return new Node({ kind: NodeKind.WINDOW, entity });
    }

    static stacked(window: Entity): Node {
        return new Node({
            kind: NodeKind.STACK,
            entities: [window],
            container: new Stack.Stack(window),
            rect: null
        });
    }

    /** Generates a string representation of the this value. */
    display(fmt: string): string {
        fmt += `{\n    kind: ${node_variant_as_string(this.inner.kind)},\n    `;

        switch (this.inner.kind) {
            // Fork + Window
            case 1:
            case 2:
                fmt += `entity: (${this.inner.entity})\n  }`;
                return fmt;
            // Stack
            case 3:
                fmt += `entities: ${this.inner.entities}\n  }`;
                return fmt;
        }


    }

    /** Check if the entity exists as a child of this stack */
    is_in_stack(entity: Entity): boolean {
        if (this.inner.kind === 3) {
            for (const compare of this.inner.entities) {
                if (Ecs.entity_eq(entity, compare)) return true;
            }
        }

        return false;
    }

    /** Asks if this fork is the fork we are looking for */
    is_fork(entity: Entity): boolean {
        return this.inner.kind === 1 && Ecs.entity_eq(this.inner.entity, entity);
    }

    /** Asks if this window is the window we are looking for */
    is_window(entity: Entity): boolean {
        return this.inner.kind === 2 && Ecs.entity_eq(this.inner.entity, entity);
    }

    /** Calculates the future arrangement of windows in this node */
    measure(
        tiler: Forest,
        ext: Ext,
        parent: Entity,
        area: Rectangle,
        record: (win: Entity, parent: Entity, area: Rectangle) => void
    ) {
        switch (this.inner.kind) {
            // Fork
            case 1:
                const fork = tiler.forks.get(this.inner.entity);
                if (fork) {
                    fork.measure(tiler, ext, area, record);
                }

                break
            // Window
            case 2:
                record(this.inner.entity, parent, area.clone());
                break
            // Stack
            case 3:
                global.log(`stack area = ${area.fmt()}`);
                const size = ext.dpi * 4;

                this.inner.rect = area.clone();
                this.inner.rect.y += size * 6;
                this.inner.rect.height -= size * 6;

                for (const entity of this.inner.entities) {
                    record(entity, parent, this.inner.rect);
                }

                if (ext.auto_tiler) {
                    ext.auto_tiler.forest.stack_updates.push([this.inner, parent]);
                }
        }
    }
}
