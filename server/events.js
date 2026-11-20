import { EventEmitter } from "node:events";
export const changes = new EventEmitter();
changes.setMaxListeners(0);
