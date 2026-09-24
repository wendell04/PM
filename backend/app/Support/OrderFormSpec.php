<?php

namespace App\Support;

use InvalidArgumentException;

/**
 * The order form the shop sends into a chat before quoting: what a template may contain, and what
 * an answer to one may be.
 *
 * The form used to be a fixed list written into the page. A printing shop does not ask the same
 * questions of a shirt order and a tarpaulin order, so the questions are now the owner's to write:
 * a template is a name, a description block (the file formats and the artwork rules) and up to
 * twenty questions. This class is the one place that says which question types exist, what their
 * limits are and how an answer to each is read - the editor, the sender, the customer's form and
 * the validator all read it, so they cannot drift apart.
 *
 * A form that was already sent never changes: the template is copied onto the message when it is
 * sent, and the copy is what the customer fills in and what the answers are checked against.
 */
class OrderFormSpec
{
    public const VERSION = 2;

    public const MAX_TEMPLATES    = 20;
    public const MAX_QUESTIONS    = 20;
    public const MAX_NAME         = 60;
    public const MAX_DESCRIPTION  = 2000;
    public const MAX_LABEL        = 120;
    public const MAX_HELP         = 160;
    public const MAX_OPTIONS      = 20;
    public const MAX_OPTION       = 60;
    public const MAX_SHORT_ANSWER = 100;
    public const MAX_LONG_ANSWER  = 1000;
    public const MAX_ITEMS        = 10;
    public const MAX_ITEM         = 160;
    public const MAX_ITEM_DETAILS = 200;
    public const MAX_QTY          = 100000;
    public const MAX_NUMBER       = 1000000;

    /**
     * The question types, in the order the editor offers them.
     *
     * `options` says the type needs a list of choices; `quantity` says an answer to it tells the
     * shop how many to make, which is the one thing every form must ask.
     */
    public static function types(): array
    {
        return [
            'short_text'  => ['label' => 'Short answer',        'note' => 'One line, up to 100 characters.',            'options' => false, 'quantity' => false],
            'long_text'   => ['label' => 'Long answer',         'note' => 'A paragraph, up to 1000 characters.',        'options' => false, 'quantity' => false],
            'number'      => ['label' => 'A number',            'note' => 'Whole numbers only.',                        'options' => false, 'quantity' => true],
            'choice_one'  => ['label' => 'Pick one',            'note' => 'A list where one answer is chosen.',         'options' => true,  'quantity' => false],
            'choice_many' => ['label' => 'Pick any',            'note' => 'A list where several may be chosen.',        'options' => true,  'quantity' => false],
            'size_grid'   => ['label' => 'Sizes and how many',  'note' => 'A row per size with a quantity beside it.',  'options' => true,  'quantity' => true],
            'item_list'   => ['label' => 'List of items',       'note' => 'Item, details and quantity, up to 10 rows.', 'options' => false, 'quantity' => true],
            'date'        => ['label' => 'A date',              'note' => 'A day picked from a calendar.',              'options' => false, 'quantity' => false],
            // Where the print goes. The AREAS are the owner's - front, back, a sleeve, the lid of a
            // box - each with the biggest size that area takes. Nothing about a t-shirt is
            // written into the code; a mug or a tote is the same question with different rows.
            'print_area'  => ['label' => 'Print area',          'note' => 'Areas with a maximum print size on each.',   'options' => true,  'quantity' => false],
        ];
    }

    /** Types whose answer says how many to make. */
    public static function quantityTypes(): array
    {
        return array_keys(array_filter(self::types(), fn ($t) => $t['quantity']));
    }

    /**
     * What every form asks, whatever the owner writes.
     *
     * These are not questions in the template and cannot be added, edited or removed. They are
     * the things an order cannot be fulfilled without: who it is, how to reach them, where it is
     * going, and the two confirmations. Leaving them to the owner to remember means the day one
     * gets forgotten is the day a job arrives with nowhere to send it.
     *
     * The shop's own Weebly form asked exactly these, which is what this is modelled on.
     */
    public static function core(): array
    {
        return [
            'fields' => [
                ['id' => 'fullName', 'label' => 'Full name',                 'type' => 'text',     'required' => true,
                 'help' => '', 'from' => 'name'],
                ['id' => 'contact',  'label' => 'Contact number',            'type' => 'phone',    'required' => true,
                 'help' => '', 'from' => 'phone'],
                ['id' => 'email',    'label' => 'Email address',             'type' => 'email',    'required' => true,
                 'help' => '', 'from' => 'email'],
                // One field, typed or picked from a saved address. The pickup-or-deliver choice was
                // here and is gone: the shop delivers, and somebody collecting says so in the notes.
                ['id' => 'address',  'label' => 'Complete shipping address', 'type' => 'address',  'required' => true,
                 'help' => 'House or unit, street, barangay, city, province and postcode.', 'from' => 'address'],
            ],
            'confirmations' => [
                ['id' => 'detailsOk', 'label' => 'Please make sure all details are correct.', 'terms' => false],
                ['id' => 'termsOk',   'label' => 'I have read and agree to the Custom Order Terms.', 'terms' => true],
            ],
        ];
    }

    /**
     * The form every shop starts with: what the fixed form asked before templates existed, so
     * nothing is lost on the day this ships and the owner has something to edit rather than a
     * blank page.
     */
    public static function starter(): array
    {
        return [
            'name'        => 'Custom Order Form',
            // The shop's own words. The file formats come FIRST because that is what somebody
            // opening this needs to know before anything else; the invitation to chat follows.
            // Every line of it is the owner's to rewrite in Settings.
            'description' => "Jpeg, PSD, PDF, PNG. Choose any format you want. 300 dpi or at least a clear design.\n"
                . "E-mail your files to personalizemeprints.admin@gmail.com with Subject: DESIGN (your full name)\n"
                . "\n"
                . "LAYOUT | DESIGN\n"
                . "Prefer to chat? You can stay on this chat to send your inquiries or discuss your "
                . "design preferences with us anytime.",
            // A t-shirt order, because that is the shop's commonest job - but written as DATA, not
            // as code. Change a colour, add a size, swap the print areas for the lid and base of a
            // box, and it is a different form with nothing rebuilt.
            'questions'   => [
                ['id' => 'items', 'type' => 'item_list', 'label' => 'What do you want made?',
                 'help' => 'One row per item, with the quantity beside it.', 'required' => true, 'options' => []],
                ['id' => 'colour', 'type' => 'choice_many', 'label' => 'Shirt colour',
                 'help' => 'Tick every colour you want.', 'required' => true,
                 'options' => ['White', 'Black', 'Navy', 'Red', 'Maroon', 'Sand']],
                ['id' => 'sizes', 'type' => 'size_grid', 'label' => 'Sizes and how many',
                 'help' => 'Put a number beside each size you need.', 'required' => true,
                 'options' => ['S', 'M', 'L', 'XL', '2XL', '3XL']],
                ['id' => 'printarea', 'type' => 'print_area', 'label' => 'Where does the print go?',
                 'help' => 'Tick each area. The sizes are the maximum we can print there.', 'required' => true,
                 'options' => [
                     'Front 1/4 - 15x10cm',
                     'Front half - 30x20cm',
                     'Front full - 30x40cm',
                     'Back full - 30x40cm',
                     'Left sleeve - 15x10cm',
                     'Right sleeve - 15x10cm',
                 ]],
                ['id' => 'artwork', 'type' => 'choice_one', 'label' => 'Do you have the artwork ready?',
                 'help' => '', 'required' => true,
                 'options' => ['Yes, I will e-mail the file', 'No, please design it for me', 'I have an idea but no file']],
                ['id' => 'notes', 'type' => 'long_text', 'label' => 'Other instructions',
                 'help' => 'A reference, a colour code, where it will be used.', 'required' => false, 'options' => []],
            ],
        ];
    }

    /**
     * A template as it will be stored: every field trimmed to its limit and every question a
     * shape the customer's form knows how to draw. Anything wrong throws, because a half-valid
     * form is one a customer cannot finish.
     */
    public static function sanitizeTemplate(array $in): array
    {
        $types = self::types();

        $name = self::text($in['name'] ?? '', self::MAX_NAME);
        if ($name === '') {
            throw new InvalidArgumentException('Give the form a name.');
        }

        $questions = [];
        $raw = array_values(is_array($in['questions'] ?? null) ? $in['questions'] : []);
        if (count($raw) === 0) {
            throw new InvalidArgumentException('A form needs at least one question.');
        }
        if (count($raw) > self::MAX_QUESTIONS) {
            throw new InvalidArgumentException('A form can ask at most ' . self::MAX_QUESTIONS . ' questions.');
        }

        $seen = [];
        foreach ($raw as $i => $q) {
            if (!is_array($q)) continue;
            $type = (string) ($q['type'] ?? '');
            if (!isset($types[$type])) {
                throw new InvalidArgumentException('Question ' . ($i + 1) . ' has no question type.');
            }
            $label = self::text($q['label'] ?? '', self::MAX_LABEL);
            if ($label === '') {
                throw new InvalidArgumentException('Question ' . ($i + 1) . ' needs a question to ask.');
            }

            $options = [];
            if ($types[$type]['options']) {
                foreach (is_array($q['options'] ?? null) ? $q['options'] : [] as $o) {
                    $o = self::text($o, self::MAX_OPTION);
                    if ($o !== '' && !in_array($o, $options, true)) $options[] = $o;
                }
                if (count($options) < 2) {
                    throw new InvalidArgumentException('"' . $label . '" needs at least two choices.');
                }
                if (count($options) > self::MAX_OPTIONS) {
                    throw new InvalidArgumentException('"' . $label . '" can have at most ' . self::MAX_OPTIONS . ' choices.');
                }
            }

            // The id rides on every answer, so it has to survive renaming the question and has to
            // be unique inside the form. A new question gets one here rather than trusting the page.
            $id = preg_replace('/[^a-z0-9_]/', '', strtolower((string) ($q['id'] ?? '')));
            if ($id === '' || isset($seen[$id])) $id = 'q' . ($i + 1) . substr(md5($label . $i . microtime(true)), 0, 4);
            $seen[$id] = true;

            $questions[] = [
                'id'       => $id,
                'type'     => $type,
                'label'    => $label,
                'help'     => self::text($q['help'] ?? '', self::MAX_HELP),
                'required' => (bool) ($q['required'] ?? false),
                'options'  => $options,
            ];
        }

        // Every form must ask how many. A quotation is a price for a quantity; a form that comes
        // back without one buys nothing but another round of messages.
        $qty = self::quantityTypes();
        if (!array_filter($questions, fn ($q) => in_array($q['type'], $qty, true) && $q['required'])) {
            throw new InvalidArgumentException('One question must ask how many, and it must be required. Use a number, a size grid or a list of items.');
        }

        return [
            'name'        => $name,
            'description' => self::text($in['description'] ?? '', self::MAX_DESCRIPTION),
            'questions'   => $questions,
            'version'     => self::VERSION,
        ];
    }

    /** The template as it is copied onto a sent message: only what the form itself needs. */
    public static function snapshot(array $template): array
    {
        return [
            'name'        => (string) ($template['name'] ?? 'Order form'),
            'description' => (string) ($template['description'] ?? ''),
            'questions'   => array_values(is_array($template['questions'] ?? null) ? $template['questions'] : []),
            'version'     => self::VERSION,
        ];
    }

    /**
     * The customer's answers, checked against the form they were shown.
     *
     * Returns [errors, clean]. Errors are in the order the form asks them, worded the way the
     * customer would say them, because they are shown on the form itself.
     */
    public static function checkAnswers(array $form, array $in): array
    {
        $errors = [];
        $clean  = [];
        $qty    = self::quantityTypes();
        $total  = 0;
        $asksQty = false;
        $qtyNamed = false;   // a quantity question that already reported itself missing

        foreach ($form['questions'] ?? [] as $q) {
            $id    = (string) ($q['id'] ?? '');
            $type  = (string) ($q['type'] ?? '');
            $label = (string) ($q['label'] ?? 'Question');
            $req   = (bool) ($q['required'] ?? false);
            $v     = $in[$id] ?? null;
            $before = count($errors);
            if (in_array($type, $qty, true) && $req) $asksQty = true;

            switch ($type) {
                case 'short_text':
                case 'long_text': {
                    $s = self::text($v, $type === 'short_text' ? self::MAX_SHORT_ANSWER : self::MAX_LONG_ANSWER);
                    if ($req && $s === '') { $errors[] = $label; break; }
                    $clean[$id] = $s;
                    break;
                }
                case 'number': {
                    $s = trim((string) (is_scalar($v) ? $v : ''));
                    if ($s === '') { if ($req) $errors[] = $label; break; }
                    if (!ctype_digit($s)) { $errors[] = $label . ' (numbers only)'; break; }
                    $n = (int) $s;
                    if ($n > self::MAX_NUMBER) { $errors[] = $label . ' (too large)'; break; }
                    if ($req && $n < 1) { $errors[] = $label; break; }
                    $clean[$id] = $n;
                    $total += in_array($type, $qty, true) ? $n : 0;
                    break;
                }
                case 'choice_one': {
                    $s = self::text($v, self::MAX_OPTION);
                    if ($s === '') { if ($req) $errors[] = $label; break; }
                    if (!in_array($s, $q['options'] ?? [], true)) { $errors[] = $label; break; }
                    $clean[$id] = $s;
                    break;
                }
                case 'choice_many': {
                    $picked = [];
                    foreach (is_array($v) ? $v : [] as $o) {
                        $o = self::text($o, self::MAX_OPTION);
                        if (in_array($o, $q['options'] ?? [], true) && !in_array($o, $picked, true)) $picked[] = $o;
                    }
                    if ($req && !$picked) { $errors[] = $label; break; }
                    $clean[$id] = $picked;
                    break;
                }
                case 'size_grid': {
                    $rows = [];
                    $sum  = 0;
                    foreach (is_array($v) ? $v : [] as $row) {
                        if (!is_array($row)) continue;
                        $size = self::text($row['size'] ?? '', self::MAX_OPTION);
                        $n    = (int) ($row['qty'] ?? 0);
                        if (!in_array($size, $q['options'] ?? [], true) || $n < 1) continue;
                        if ($n > self::MAX_QTY) { $n = self::MAX_QTY; }
                        $rows[] = ['size' => $size, 'qty' => $n];
                        $sum   += $n;
                    }
                    if ($req && !$rows) { $errors[] = $label . ' (put a quantity on at least one size)'; break; }
                    $clean[$id] = $rows;
                    $total += $sum;
                    break;
                }
                case 'item_list': {
                    $rows = [];
                    $sum  = 0;
                    $missingQty = false;
                    foreach (is_array($v) ? $v : [] as $row) {
                        if (!is_array($row)) continue;
                        $item = self::text($row['item'] ?? '', self::MAX_ITEM);
                        if ($item === '') continue;
                        $n = (int) ($row['qty'] ?? 0);
                        if ($n < 1) { $missingQty = true; continue; }
                        if ($n > self::MAX_QTY) $n = self::MAX_QTY;
                        $rows[] = ['item' => $item, 'details' => self::text($row['details'] ?? '', self::MAX_ITEM_DETAILS), 'qty' => $n];
                        $sum  += $n;
                        if (count($rows) >= self::MAX_ITEMS) break;
                    }
                    if ($missingQty) { $errors[] = $label . ' (a quantity on every item)'; break; }
                    if ($req && !$rows) { $errors[] = $label . ' (at least one item)'; break; }
                    $clean[$id] = $rows;
                    $total += $sum;
                    break;
                }
                case 'date': {
                    $s = self::text($v, 10);
                    if ($s === '') { if ($req) $errors[] = $label; break; }
                    $d = \DateTimeImmutable::createFromFormat('!Y-m-d', $s);
                    if (!$d || $d->format('Y-m-d') !== $s) { $errors[] = $label . ' (pick a date)'; break; }
                    if ($d < new \DateTimeImmutable('-1 year') || $d > new \DateTimeImmutable('+5 years')) { $errors[] = $label . ' (pick a date)'; break; }
                    $clean[$id] = $s;
                    break;
                }
            }
            if (count($errors) > $before && in_array($type, $qty, true)) $qtyNamed = true;
        }

        // Only when no quantity question already named itself: "Sizes (put a quantity on at least
        // one size), How many you want made" says the same thing twice.
        if ($asksQty && $total < 1 && !$qtyNamed) $errors[] = 'How many you want made';

        return [array_values(array_unique($errors)), $clean];
    }

    /** How many pieces the answers add up to, across every question that carries a quantity. */
    public static function totalQuantity(array $form, array $answers): int
    {
        $total = 0;
        foreach ($form['questions'] ?? [] as $q) {
            $v = $answers[$q['id'] ?? ''] ?? null;
            switch ($q['type'] ?? '') {
                case 'number':    $total += (int) $v; break;
                case 'size_grid': foreach (is_array($v) ? $v : [] as $r) $total += (int) ($r['qty'] ?? 0); break;
                case 'item_list': foreach (is_array($v) ? $v : [] as $r) $total += (int) ($r['qty'] ?? 0); break;
            }
        }
        return $total;
    }

    /**
     * A short name for what was asked for, for the ask list and the notification: the first item
     * of the first list, or the first answer that reads like a thing.
     */
    public static function headline(array $form, array $answers): string
    {
        foreach ($form['questions'] ?? [] as $q) {
            $v = $answers[$q['id'] ?? ''] ?? null;
            if (($q['type'] ?? '') === 'item_list' && is_array($v) && $v) {
                $first = (string) ($v[0]['item'] ?? '');
                $more  = count($v) - 1;
                return $more > 0 ? "{$first} + {$more} more" : $first;
            }
        }
        foreach ($form['questions'] ?? [] as $q) {
            $v = $answers[$q['id'] ?? ''] ?? null;
            if (in_array($q['type'] ?? '', ['short_text', 'choice_one'], true) && is_string($v) && trim($v) !== '') {
                return trim($v);
            }
        }
        return 'Order form';
    }

    /** The answers as plain lines, for the chat card body, the notification and the quote note. */
    public static function summarise(array $form, array $answers): string
    {
        $out = [];
        foreach ($form['questions'] ?? [] as $q) {
            $id = (string) ($q['id'] ?? '');
            $v  = $answers[$id] ?? null;
            $label = (string) ($q['label'] ?? '');
            switch ($q['type'] ?? '') {
                case 'item_list':
                    foreach (is_array($v) ? $v : [] as $r) {
                        $out[] = ($r['qty'] ?? '?') . ' x ' . ($r['item'] ?? '') . (($r['details'] ?? '') !== '' ? ' (' . $r['details'] . ')' : '');
                    }
                    break;
                case 'size_grid': {
                    $bits = [];
                    foreach (is_array($v) ? $v : [] as $r) $bits[] = ($r['size'] ?? '') . ' x ' . ($r['qty'] ?? 0);
                    if ($bits) $out[] = $label . ': ' . implode(', ', $bits);
                    break;
                }
                case 'choice_many':
                    if (is_array($v) && $v) $out[] = $label . ': ' . implode(', ', $v);
                    break;
                default:
                    if (is_scalar($v) && trim((string) $v) !== '') $out[] = $label . ': ' . $v;
            }
        }
        return implode("\n", $out);
    }

    /** Trimmed, tag-free and cut to length. Answers are shown back in the dashboard as text. */
    private static function text($v, int $max): string
    {
        if (!is_scalar($v)) return '';
        $s = trim(strip_tags((string) $v));
        $s = htmlspecialchars_decode($s, ENT_QUOTES);
        $s = htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        return mb_substr($s, 0, $max);
    }
}
