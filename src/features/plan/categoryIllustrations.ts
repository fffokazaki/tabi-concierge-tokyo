import culture from "../../assets/category-illustrations/culture.webp";
import dining from "../../assets/category-illustrations/dining.webp";
import heritage from "../../assets/category-illustrations/heritage.webp";
import lodging from "../../assets/category-illustrations/lodging.webp";
import park from "../../assets/category-illustrations/park.webp";
import restroom from "../../assets/category-illustrations/restroom.webp";
import sento from "../../assets/category-illustrations/sento.webp";
import transit from "../../assets/category-illustrations/transit.webp";
import unknown from "../../assets/category-illustrations/unknown.webp";
import {
  CATEGORY_ILLUSTRATION_GROUPS,
  isKnownCategory,
  type CategoryIllustrationGroup,
} from "./categoryIllustrationGroups";

const GROUP_IMAGES: Record<CategoryIllustrationGroup, string> = {
  transit,
  dining,
  lodging,
  culture,
  heritage,
  park,
  restroom,
  sento,
};

export type CategoryIllustration =
  | { kind: "mapped"; src: string }
  | { kind: "unknown"; src: string }
  | { kind: "unassigned" };

export function resolveCategoryIllustration(category: string): CategoryIllustration {
  if (!category || !isKnownCategory(category)) {
    return category ? { kind: "unknown", src: unknown } : { kind: "unassigned" };
  }

  const group = CATEGORY_ILLUSTRATION_GROUPS[category];
  return group === null ? { kind: "unassigned" } : { kind: "mapped", src: GROUP_IMAGES[group] };
}
