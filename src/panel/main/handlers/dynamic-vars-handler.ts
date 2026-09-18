/**
 * Telling the webview which `{{$dynamic}}` names exist.
 *
 * The registry lives on the host — its resolvers use node crypto — so the
 * webview cannot enumerate it by importing anything, and the `{{` completion
 * list needs the names. It already carries a description, a category and an
 * example per entry, which is exactly what a suggestion row wants, so the
 * metadata is sent rather than restated over there.
 *
 * A handler rather than two inline blocks because there are two hosts: the
 * extension's MainPanel and the dev server's router. Something that only one
 * of them sends is a feature that works in the extension and not in the
 * browser, or the other way round, and the difference shows up as the list
 * being mysteriously shorter.
 */
import { getAllResolvers } from '../../../services/variables';

type PostMessage = (msg: unknown) => void;

export function handleGetDynamicVariables(postMessage: PostMessage): void {
  postMessage({
    type: 'dynamicVariables:data',
    variables: getAllResolvers().map(r => ({
      name: r.name,
      description: r.description,
      category: r.category,
      example: r.example,
    })),
  });
}
