import './styles/app-base.css';
import './styles/battle-view.css';
import './styles/editor.css';
import { migrateLegacyProjectStorage } from './projectIdentity.ts';
import { EditorApp } from './editor/EditorApp.ts';

migrateLegacyProjectStorage();

const root = document.querySelector<HTMLDivElement>('#editor-app');
if (!root) {
  throw new Error('#editor-app not found');
}

new EditorApp(root);
