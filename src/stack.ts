// @ts-ignore
const Me = imports.misc.extensionUtils.getCurrentExtension();

import type { Entity } from './ecs';
import type { Ext } from './extension';

import * as Ecs from 'ecs';

const { St } = imports.gi;
const GLib: GLib = imports.gi.GLib;
const Main = imports.ui.main;

interface Component {
    entity: Entity;
    button: St.Widget;
}

export class Stack {
    private container = new St.BoxLayout({
        style_class: 'pop-shell-stack-bg',
        vertical: true
    });

    private tabs = new St.BoxLayout({
        style_class: 'pop-shell-stack',
        x_expand: true
    });

    active: Entity;

    active_id: number = 0;

    windows: Array<Component> = new Array();

    keep_in_back: SignalID = GLib.timeout_add(250, GLib.PRIORITY_DEFAULT, () => {
        global.window_group.set_child_at_index(this.container, 1);
        return true;
    });

    constructor(active: Entity) {
        this.active = active;

        global.window_group.insert_child_at_index(this.container, 1);

        Main.layoutManager.trackChrome(this.container, {
            trackFullscreen: true,
            affectsInputRegion: false
        });

        this.container.add_child(this.tabs);
    }

    activate(entity: Entity) {
        this.active = entity;
        let id = 0;

        for (const component of this.windows) {
            let name;

            if (Ecs.entity_eq(entity, component.entity)) {
                this.active_id = id;
                name = 'pop-shell-tab-active';
            } else {
                name = 'pop-shell-tab-inactive';
            }

            component.button.set_style_class_name(name);
            id += 1;
        }
    }

    clear() {
        for (const window of this.windows.splice(0)) {
            this.tabs.remove_child(window.button);
        }
    }

    destroy() {
        Main.layoutManager.untrackChrome(this.container);
        global.window_group.remove_child(this.container);
        this.container.destroy();
        GLib.source_remove(this.keep_in_back);
    }

    update_positions(_ext: Ext, dpi: number, rect: Rectangular) {
        const width = 4 * dpi;
        const tabs_height = width * 6;
        this.container.x = rect.x;
        this.container.y = rect.y - tabs_height;
        this.container.width = rect.width;
        this.container.height = tabs_height + rect.height;
        this.tabs.height = tabs_height;
    }

    update_tabs(ext: Ext, data: Array<[Entity, string]>) {
        this.clear();

        this.windows.splice(0);

        this.tabs.destroy_all_children();

        for (const [entity, label] of data) {
            const button: St.Widget = new St.Button({
                label,
                x_expand: true,
                style_class: Ecs.entity_eq(entity, this.active)
                    ? 'pop-shell-tab-active'
                    : 'pop-shell-tab-inactive'
            });

            // On click, raise the window to the top of the stack, and activate the window's tab
            button.connect('clicked', () => {
                const window = ext.windows.get(entity);
                if (window) {
                    const actor = window.meta.get_compositor_private();
                    if (actor) {
                        window.meta.raise();
                        window.meta.unminimize();
                        window.meta.activate(global.get_current_time());

                        global.window_group.set_child_above_sibling(actor, null);

                        for (const comp of this.windows) {
                            comp.button.set_style_class_name('pop-shell-tab-inactive');
                        }

                        button.set_style_class_name('pop-shell-tab-active');
                    } else {
                        this.remove_tab(entity);
                    }
                }
            });

            this.windows.push({ entity, button });
            this.tabs.add_actor(button);
        }
    }

    remove_tab(entity: Entity) {
        let idx = 0;
        for (const window of this.windows) {
            if (Ecs.entity_eq(window.entity, entity)) {
                this.tabs.remove_child(window.button);
                this.windows.splice(idx, 1);
                break
            }
        }
    }

    set_visible(visible: boolean) {
        if (visible) {
            this.tabs.show();
        } else {
            this.tabs.hide();
        }
    }
}
