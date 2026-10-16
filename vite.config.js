import { defineConfig } from 'vite';
import { CHANGELOG } from './src/modules/changelogData.js';

// Publie le changelog en JSON à la racine du site (/changelog.json) : l'Edge
// Function notifier-mise-a-jour le lit pour détecter une nouvelle version en
// ligne et prévenir les abonnés par email.
const changelogJson = {
  name: 'changelog-json',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'changelog.json', source: JSON.stringify(CHANGELOG) });
  },
};

export default defineConfig({
  plugins: [changelogJson]
});
