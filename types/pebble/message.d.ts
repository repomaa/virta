declare module "pebble/message" {
  interface MessageOptions {
    keys: string[];
    onReadable(this: Message): void;
    onWritable(this: Message): void;
    onSuspend(this: Message): void;
    input?: number;
    output?: number;
  }

  class Message {
    constructor(options: MessageOptions);
    write(data: Map<string, string | number>): void;
    read(): Map<string, string | number>;
  }

  export default Message;
}