import { StringFormat } from '@scola/core';
import en from './en';
import nl from './nl';

export default function loadI18n() {
  StringFormat.data({
    en,
    nl
  });
}
