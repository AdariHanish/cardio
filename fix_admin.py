
with open('c:/Users/honey/Desktop/cardiovascular_project/website/admin.html', 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace('autocomplete=\"off\"', 'autocomplete=\"off\" value=\"\"')
text = text.replace('id=\"adminPass\" placeholder=\"Enter password\"', 'id=\"adminPass\" placeholder=\"Enter password\" autocomplete=\"new-password\" value=\"\"')

js_old = '''<script>
  window.onload = () => {
    sessionStorage.clear();
  };'''

js_new = '''<script>
  window.onload = () => {
    sessionStorage.clear();
    document.getElementById(\"adminUser\").value = \"\";
    document.getElementById(\"adminPass\").value = \"\";
  };'''

text = text.replace(js_old, js_new)

with open('c:/Users/honey/Desktop/cardiovascular_project/website/admin.html', 'w', encoding='utf-8') as f:
    f.write(text)

