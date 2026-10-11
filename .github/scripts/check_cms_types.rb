#!/usr/bin/env ruby
# frozen_string_literal: true
# Prevent Pages CMS editing forms from rejecting valid content due to incorrect field types.
require "json"
require "yaml"

config = YAML.load_file(".pages.yml")
raise "Missing CMS content collections" unless config["content"].is_a?(Array)
group = config["content"].find { |entry| entry["name"] == "website_content" }
raise "Missing Website Pages CMS editor" unless group && group["items"].is_a?(Array)

def verify_field(field, value, location)
  name = field.fetch("name")
  path = "#{location}.#{name}"
  raise "#{path}: missing content field" if value == :__missing__
  list = field["list"]
  if list
    raise "#{path}: expected list, received #{value.class}" unless value.is_a?(Array)
    minimum = list.is_a?(Hash) ? list["min"] : nil
    maximum = list.is_a?(Hash) ? list["max"] : nil
    raise "#{path}: below configured minimum" if minimum && value.length < minimum
    raise "#{path}: above configured maximum" if maximum && value.length > maximum
    value.each_with_index { |entry, i| verify_single(field, entry, "#{path}[#{i}]") }
  else
    verify_single(field, value, path)
  end
end

def verify_single(field, value, path)
  type = field.fetch("type")
  case type
  when "object"
    raise "#{path}: expected object, received #{value.class}" unless value.is_a?(Hash)
    (field["fields"] || []).each do |child|
      key = child.fetch("name")
      verify_field(child, value.fetch(key, :__missing__), path)
    end
  when "boolean"
    raise "#{path}: expected boolean, received #{value.class}" unless value == true || value == false
  when "number"
    raise "#{path}: expected number, received #{value.class}" unless value.is_a?(Numeric)
  when "string", "text", "image", "file", "select", "rich-text"
    raise "#{path}: expected text, received #{value.class}" unless value.is_a?(String)
    if type == "select"
      choices = field.dig("options", "values") || []
      allowed = choices.map { |choice| choice.is_a?(Hash) ? choice["name"] : choice }
      raise "#{path}: unknown select value #{value.inspect}" unless allowed.include?(value)
    end
  else
    warn "Not checking unsupported CMS field type #{type.inspect} at #{path}"
  end
end

group.fetch("items").each do |item|
  path = item.fetch("path")
  raise "Missing CMS data file: #{path}" unless File.file?(path)
  data = JSON.parse(File.read(path))
  raise "#{path}: expected top-level object" unless data.is_a?(Hash)
  item.fetch("fields").each do |field|
    verify_field(field, data.fetch(field.fetch("name"), :__missing__), path)
  end
end
puts "Pages CMS content/schema compatibility PASS for #{group.fetch('items').size} website pages"
