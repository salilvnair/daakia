import { LeftNavSlot } from '../slots/LeftNavSlot';
import { CenterSlot } from '../slots/CenterSlot';
import { RightNavSlot } from '../slots/RightNavSlot';
import { REST_LEFT_NAV_HTML, REST_CENTER_HTML, REST_RIGHT_NAV_HTML } from './restHtml';

export function RestView() {
  return (
    <div className="flex h-full w-full overflow-hidden">
      <LeftNavSlot html={REST_LEFT_NAV_HTML} />
      <CenterSlot html={REST_CENTER_HTML} />
      <RightNavSlot html={REST_RIGHT_NAV_HTML} />
    </div>
  );
}
