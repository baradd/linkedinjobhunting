import { BotUpdate } from './bot.update';

const makeBot = (opts: { owner?: string; secret?: string; fixed?: boolean }) => {
  let owner = opts.owner;
  const ownerSvc = {
    getChatId: async () => owner,
    claim: async (id: string) => { owner = id; },
    release: async () => { owner = undefined; },
    pairingSecret: opts.secret,
    isFixedByEnv: !!opts.fixed,
  };
  const update = new BotUpdate({ telegram: { setMyCommands: async () => true } } as never, ownerSvc as never, {} as never, {} as never);
  return { update, getOwner: () => owner };
};

const ctx = (id: number, text: string, type = 'private') => {
  const replies: string[] = [];
  return { replies, c: { chat: { id, type }, message: { text }, reply: async (t: string) => { replies.push(t); } } as never };
};

describe('pairing guard', () => {
  it('first /start claims the bot and does not fall through', async () => {
    const { update, getOwner } = makeBot({});
    const { c, replies } = ctx(42, '/start');
    const next = jest.fn();
    await update.guard(c, next);
    expect(getOwner()).toBe('42');
    expect(next).not.toHaveBeenCalled();
    expect(replies[0]).toContain('Paired');
  });

  it('requires the secret when configured', async () => {
    const { update, getOwner } = makeBot({ secret: 's3cret' });
    await update.guard(ctx(1, '/start').c, jest.fn());
    await update.guard(ctx(1, '/start wrong').c, jest.fn());
    expect(getOwner()).toBeUndefined();
    await update.guard(ctx(1, '/start s3cret').c, jest.fn());
    expect(getOwner()).toBe('1');
  });

  it('ignores other messages and group chats while unpaired', async () => {
    const { update, getOwner } = makeBot({});
    await update.guard(ctx(5, '/check').c, jest.fn());
    await update.guard(ctx(-100, '/start', 'group').c, jest.fn());
    expect(getOwner()).toBeUndefined();
  });

  it('after pairing only the owner gets through', async () => {
    const { update } = makeBot({ owner: '42' });
    const ok = jest.fn(), no = jest.fn();
    await update.guard(ctx(42, '/check').c, ok);
    await update.guard(ctx(99, '/check').c, no);
    expect(ok).toHaveBeenCalledTimes(1);
    expect(no).not.toHaveBeenCalled();
  });
});
