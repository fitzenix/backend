import { Schema, model, Types, type Model, type HydratedDocument } from 'mongoose';

export interface IConversation {
  gym: Types.ObjectId;
  participants: Types.ObjectId[];
  lastMessage?: { text?: string; sender?: Types.ObjectId; at?: Date };
  /** Unread counts keyed by userId string. */
  unread: Map<string, number>;
  createdAt: Date;
  updatedAt: Date;
}

export type ConversationModel = Model<IConversation>;
export type ConversationDocument = HydratedDocument<IConversation>;

const conversationSchema = new Schema<IConversation, ConversationModel>(
  {
    gym: { type: Schema.Types.ObjectId, ref: 'Gym', required: true, index: true },
    participants: [{ type: Schema.Types.ObjectId, ref: 'User', required: true }],
    lastMessage: {
      text: String,
      sender: { type: Schema.Types.ObjectId, ref: 'User' },
      at: Date,
    },
    unread: { type: Map, of: Number, default: {} },
  },
  { timestamps: true, toJSON: { versionKey: false } },
);

conversationSchema.index({ gym: 1, participants: 1 });

export const Conversation = model<IConversation, ConversationModel>('Conversation', conversationSchema);
export default Conversation;
