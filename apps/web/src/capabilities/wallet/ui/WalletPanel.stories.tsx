import type { Meta, StoryObj } from '@storybook/react-vite';
import { WalletPanel } from './WalletPanel.js';
const meta = {
  title: 'Capabilities/Wallet',
  component: WalletPanel,
  args: {
    pending: false,
    state: { kind: 'disconnected' },
    onConnect: () => undefined,
    onDisconnect: () => undefined,
    onSwitch: () => undefined,
  },
} satisfies Meta<typeof WalletPanel>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Disconnected: Story = {};
export const WrongNetwork: Story = {
  args: {
    state: {
      kind: 'wrong-network',
      account: '0x1111111111111111111111111111111111111111',
      actualChainId: 1,
      requiredChainId: 31337,
    },
  },
};
export const Rejected: Story = { args: { state: { kind: 'disconnected' }, pending: false } };
