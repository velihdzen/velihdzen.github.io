const input = document.getElementById('input_ch');
const div_result = document.getElementById('div_result');
const span_result_codec = document.getElementById('span_result_codec');
const span_result_content = document.getElementById('span_result_content');
input.addEventListener('input', (e) => {
    const content = contentHash.decode(e.target.value);
    const codec = contentHash.getCodec(e.target.value);
    span_result_codec.textContent = codec;
    span_result_content.textContent = content;
    div_result.style.display = "block"
});