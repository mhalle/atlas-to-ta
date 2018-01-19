const fs = require('fs');
const Database = require('better-sqlite3');
const _ = require('lodash');
const csv_stringify = require('csv-stringify/lib/sync');
const csv_parse = require('csv-parse/lib/sync');
const Promise = require('bluebird');

function fts5_quote(s) {
    return _.join(_.map(_.split(s, " "), word => {
        if (word == 'left' || word == 'right') {
            return '';
        }
        if (word.indexOf('-') != -1) {
            return '"' + word + '"';
        }
        return word;
    }), ' ');
}

function main() {
    const dbname = process.argv[2];
    const csvfile = process.argv[3];
    let db = new Database(dbname);
    let columns = ['Label',
        'Parent Name',
        'Atlas Name',
        'Substitute',
        'TA Name',
        'Hierarchy',
        'TA ID',
        'Wikipedia Title'];

    let atlas_data = csv_parse(fs.readFileSync(csvfile), { columns: true, header: true });

    let match_records = [];

    _.forEach(atlas_data, record => {
        let labelNumber = record['Label'] === '' ? -1 : _.toInteger(record['Label']);
        let atlas_name = record['Atlas Name'];
        let parent_name = record['Parent Name'];

        let subname = record['Substitute'];

        if (!atlas_name) {
            return;
        }
        if (subname == '-') {
            // leave it alone
            match_records.push([
                record['Label'],
                record['Parent Name'],
                record['Atlas Name'],
                record['Substitute'],
                record['TA Name'],
                record['Hierarchy'],
                record['TA ID'],
                record['Wikipedia Title'],
            ]);
        }
        else if (subname && subname[0] == '!') {
            let exact_name = subname.slice(1);
            let exact_match = db.prepare("select name_en, id from ta98 \
                        where name_en = $query or \
                            name_la = $query or \
                            id = $query \
                            limit 1").get({ $query: subname });
            if (exact_match) {
                match_records.push([labelNumber,
                    parent_name,
                    atlas_name,
                    subname,
                    exact_match.name_en,
                    null,
                    exact_match.id,
                    record['Wikipedia Title']]);
            }
        }
        else {
            let name_to_search = subname ? subname : atlas_name;
            let stripped_name = name_to_search.replace('left ', '').replace('right ', '');
            let fts5_query = _.map(stripped_name.split(' '), word => {
                if (word.indexOf('-') != -1) {
                    return word.replace('-', ' ');
                }
                return word;
            }).join(' OR ');

            let row = db.prepare("select name_en, id, hierarchy from ta98_fts \
                    where ta98_fts match ? order by \
                    bm25(ta98_fts, 100, 100, 100, 1) limit 1").get(fts5_query);
            if (row) {
                match_records.push([labelNumber,
                    parent_name,
                    atlas_name,
                    subname,
                    row.name_en,
                    row.hierarchy,
                    row.id,
                    record['Wikipedia Title']]);
            }
            else {
                match_records.push([labelNumber,
                    parent_name,
                    atlas_name,
                    subname,
                    null,
                    null,
                    null,
                    null]);
            }
        }
    });

    _.forEach(match_records, row => {
        let id = row[6];
        if (id !== null) {
            let wmatch = db.prepare('select \
                        wikipedia.wp_title as wp_title  \
                        from wikipedia join wp_page_info on \
                        wikipedia.wp_title = wp_page_info.wp_title \
                        where id = ?').get(id);
            if (wmatch) {
                row[7] = wmatch.wp_title;
            }
        }
    });

    let sorted_records = _.sortBy(match_records, 0);
    let csv_out = csv_stringify(sorted_records, {
        columns: columns,
        header: true
    }
    );
    console.log(csv_out);
}

main();
