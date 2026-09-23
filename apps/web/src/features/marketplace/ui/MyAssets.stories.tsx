import type { Meta, StoryObj } from '@storybook/react-vite';
import { MyAssets } from './MyAssets.js';

const assets = [
  { tokenId: '1', name: 'Harbor RS', currentOwner: null },
  { tokenId: '2', name: 'Cinder XR', currentOwner: null },
];

const meta = {
  title: 'Marketplace/MyAssets',
  component: MyAssets,
  args: {
    assets,
    enabled: true,
    approvalStates: new Map([
      ['1', 'not-approved'],
      ['2', 'approved'],
    ]),
    onApprove: async () => {},
    onCreate: async () => {},
  },
} satisfies Meta<typeof MyAssets>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ApprovalNeeded: Story = {};
export const WaitingForInclusion: Story = {
  args: {
    approvalStates: new Map([
      ['1', 'pending'],
      ['2', 'approved'],
    ]),
  },
};
export const CreatingSale: Story = {
  args: {
    approvalStates: new Map([
      ['1', 'approved'],
      ['2', 'approved'],
    ]),
    pendingActionKeys: new Set(['CREATE_SALE:1']),
  },
};
