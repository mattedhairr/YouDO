import type { SceneId } from '../lib/headerScenes';
import plains from '../assets/scenes/plains.webp';
import himalaya from '../assets/scenes/himalaya.webp';
import ghats from '../assets/scenes/ghats.webp';

/**
 * The scenes' land pictures (made by the owner; their skies removed so the
 * header's live sky shows behind). Loaded only with the header, which is lazy.
 */
export const SCENE_ART: Record<SceneId, string> = { plains, himalaya, ghats };
