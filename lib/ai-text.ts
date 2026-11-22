const cjk = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
const latin = /[A-Za-z0-9]/;

function needsSpace(left: string, right: string) {
  return (cjk.test(left) && latin.test(right)) || (latin.test(left) && cjk.test(right));
}

// AI 文案里中文与英文、数字之间统一补一个空格。
export function spaceCjkLatin(text: string) {
  let result = "";
  let previous = "";
  for (const char of text) {
    if (previous && needsSpace(previous, char)) result += " ";
    result += char;
    previous = char;
  }
  return result;
}
