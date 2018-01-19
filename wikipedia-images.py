import sqlite3
import sys
import json

def get_wikipedia_images(dbfilename):

    with sqlite3.connect(dbfilename) as conn:
        cur = conn.cursor()
        rows = cur.execute("""select wp_title, group_concat(image_url, '|')
            from wp_images group by wp_title""")

        wp_index = {}
        for r in rows:
            wp_index[r[0]] = r[1].replace('https://upload.wikimedia.org/wikipedia/commons/','').split('|')
        return wp_index

if __name__ == '__main__':
    wp_images = get_wikipedia_images(sys.argv[1])
    print(json.dumps(wp_images))