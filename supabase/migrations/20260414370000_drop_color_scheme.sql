-- user_settings から color_scheme を削除
-- CSSにscheme-*の定義がなく、UIに切替機能もないためデッドコード

ALTER TABLE user_settings DROP COLUMN color_scheme;
