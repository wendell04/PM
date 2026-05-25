FROM dunglas/frankenphp:php8.2-bookworm

COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

WORKDIR /app

RUN install-php-extensions mongodb ctype curl dom fileinfo filter hash mbstring openssl pcre pdo session tokenizer xml

COPY composer.json composer.lock artisan ./
RUN composer install --optimize-autoloader --no-scripts --no-interaction

COPY . .

RUN mkdir -p storage/framework/{sessions,views,cache,testing} storage/logs bootstrap/cache \
    && chmod -R 777 storage bootstrap/cache

EXPOSE 80 443 8080

CMD ["/start-container.sh"]
