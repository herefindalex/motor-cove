import type { Preview } from '@storybook/react-vite';
import '../src/app/styles.css';
const preview: Preview = { parameters: { a11y: { test: 'error' }, layout: 'padded' } };
export default preview;
