import type { Meta, StoryObj } from '@storybook/react-vite';
import { Marketplace } from './Marketplace.js';
const sale = {
  saleId: '1',
  tokenId: '1',
  seller: '0x1111111111111111111111111111111111111111',
  buyer: null,
  priceWei: '1000000000000000000',
  fundedAt: null,
  expiresAt: null,
  status: 'LISTED' as const,
  tokenReclaimed: false,
  metadataStatus: 'AVAILABLE' as const,
  catalogId: 'apex-gt',
  claim: null,
};
const vehicle = {
  tokenId: '1',
  name: 'Apex GT',
  description: 'Track-inspired electric collectible',
  imagePath: '/vehicles/apex.svg',
  currentOwner: '0x2222222222222222222222222222222222222222',
};
const meta = {
  title: 'Marketplace/Marketplace',
  component: Marketplace,
  args: {
    sales: [sale],
    vehicles: [vehicle],
    account: undefined,
    actions: undefined,
    currentTimestamp: 100,
    provenance: <span className="provenance">Indexed block 8</span>,
  },
} satisfies Meta<typeof Marketplace>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Listed: Story = {};
export const ProjectionLag: Story = {
  args: { provenance: <span className="notice">Projection stale · indexed 8 · head 12</span> },
};
export const Empty: Story = { args: { sales: [] } };
