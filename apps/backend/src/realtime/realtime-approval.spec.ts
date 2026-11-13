import { RealtimeGateway } from './realtime.gateway';

// The live stream (KDS tickets, orders, tables) needs an approved restaurant,
// exactly like every REST call.
describe('realtime handshake respects restaurant approval', () => {
  function setup(approvalStatus: string) {
    const jwt: any = { verify: jest.fn(() => ({ sub: 'u1' })) };
    const prisma: any = {
      user: { findUnique: jest.fn(async () => ({ id: 'u1', isActive: true, restaurantId: 'r1', restaurant: { approvalStatus } })) },
    };
    const branchAccess: any = { assertAccess: jest.fn(async () => undefined) };
    const gw = new RealtimeGateway(jwt, prisma, branchAccess);
    const client: any = {
      handshake: { headers: { cookie: 'easydine_session=tok' }, query: { branchId: 'b1' } },
      join: jest.fn(async () => undefined),
      disconnect: jest.fn(),
    };
    return { gw, client };
  }

  it.each(['PENDING', 'REJECTED'])('a %s restaurant is disconnected before joining any room', async (s) => {
    const { gw, client } = setup(s);
    await gw.handleConnection(client);
    expect(client.join).not.toHaveBeenCalled();
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('an approved restaurant joins its branch room', async () => {
    const { gw, client } = setup('APPROVED');
    await gw.handleConnection(client);
    expect(client.join).toHaveBeenCalled();
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('disconnectBranches drops sockets in those branch rooms', () => {
    const { gw } = setup('APPROVED');
    const disconnectSockets = jest.fn();
    (gw as any).server = { in: jest.fn(() => ({ disconnectSockets })) };
    gw.disconnectBranches(['b1']);
    expect((gw as any).server.in).toHaveBeenCalledWith(['branch:b1'].map((r) => expect.stringContaining('b1')));
    expect(disconnectSockets).toHaveBeenCalledWith(true);
  });
});
