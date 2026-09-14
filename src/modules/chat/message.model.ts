import { Schema, model, Types, type Model, type HydratedDocument } from 'mongoose';

export interface IMessage {
  conversation: Types.ObjectId;
  gym: Types.ObjectId;
  sender: Types.ObjectId;
  text: string;
  readBy: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

export type MessageModel = Model<IMessage>;
export type MessageDocument = HydratedDocument<IMessage>;

const messageSchema = new Schema<IMessage, MessageModel>(
  {
    conversation: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
    gym: { type: Schema.Types.ObjectId, ref: 'Gym', required: true, index: true },
    sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, maxlength: 4000 },
    readBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true, toJSON: { versionKey: false } },
);

messageSchema.index({ conversation: 1, createdAt: -1 });

export const Message = model<IMessage, MessageModel>('Message', messageSchema);
export default Message;
