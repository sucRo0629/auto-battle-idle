import './styles/app-base.css';
import './styles/editor.css';
import './styles/presentation-lab.css';
import { preloadSprites } from './render/SpriteRegistry.ts';
import { PresentationLabApp } from './presentation/PresentationLabApp.ts';

const root = document.querySelector<HTMLDivElement>('#presentation-lab-app');
if (!root) {
  throw new Error('#presentation-lab-app not found');
}

void preloadSprites().then(() => {
  new PresentationLabApp(root);
});
